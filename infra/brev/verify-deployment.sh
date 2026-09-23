#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
mkdir -p infra/brev/evidence
rm -f infra/brev/evidence/deployment.json

instance_id="${BREV_INSTANCE_ID:-}"
if [[ -z "$instance_id" && -f .env ]]; then
  instance_id="$(sed -n 's/^BREV_INSTANCE_ID=//p' .env | head -n 1)"
fi
if [[ -z "$instance_id" ]]; then
  echo 'Set BREV_INSTANCE_ID to the actual Brev environment ID before verification' >&2
  exit 1
fi

compose=(docker compose -f compose.yaml -f infra/brev/compose.gpu.yaml)
container_id="$("${compose[@]}" ps -q gpu-specialist)"
if [[ -z "$container_id" ]]; then
  echo 'GPU container is not running' >&2
  exit 1
fi
docker inspect "$container_id" --format '{{.State.Running}}' | grep -qx true
docker inspect "$container_id" --format '{{.Image}}' > infra/brev/evidence/image-digest.txt
docker top "$container_id" -eo pid > infra/brev/evidence/workload-pids.txt
"${compose[@]}" ps > infra/brev/evidence/compose-ps.txt
"${compose[@]}" logs --no-color gpu-specialist > infra/brev/evidence/offload.log 2>&1
nvidia-smi --query-gpu=name,uuid,memory.total --format=csv,noheader > infra/brev/evidence/gpu-identity.csv

if ! grep -Eiq 'CUDA|ggml_cuda|offload' infra/brev/evidence/offload.log; then
  echo 'No CUDA/offload startup log; GPU proof is incomplete' >&2
  exit 1
fi
if ! grep -Eiq 'offloaded [1-9][0-9]*/[1-9][0-9]* layers to GPU' infra/brev/evidence/offload.log; then
  echo 'No confirmed model-layer GPU offload; GPU proof is incomplete' >&2
  exit 1
fi

model_file='infra/brev/model-cache/qwen2.5-1.5b-instruct-q4_k_m.gguf'
sha256sum "$model_file" > infra/brev/evidence/model-sha256.txt

# Sample compute while real specialist requests run; a missing nonzero sample fails closed.
nvidia-smi pmon -s u -c 30 -d 1 > infra/brev/evidence/gpu-pmon.txt &
monitor_pid=$!
for _ in 1 2 3; do
  bash infra/brev/gpu-smoke.sh
done
wait "$monitor_pid"

export BREV_INSTANCE_ID="$instance_id" GPU_CONTAINER_ID="$container_id"
python3 - <<'PY'
import csv
import datetime as dt
import json
import os
import pathlib
import uuid

root = pathlib.Path('infra/brev/evidence')
pids = set()
for line in (root / 'workload-pids.txt').read_text().splitlines()[1:]:
    parts = line.split()
    if parts and parts[0].isdigit():
        pids.add(parts[0])
correlated = []
for line in (root / 'gpu-pmon.txt').read_text().splitlines():
    if line.startswith('#'):
        continue
    parts = line.split()
    if len(parts) >= 4 and parts[1] in pids and parts[3].isdigit() and int(parts[3]) > 0:
        correlated.append({'pid': parts[1], 'smUtil': int(parts[3]), 'sample': line})
if not correlated:
    raise SystemExit('No inference-correlated nonzero CUDA compute sample for container PID')
with (root / 'gpu-identity.csv').open() as f:
    gpu = next(csv.reader(f))
model_sha = (root / 'model-sha256.txt').read_text().split()[0]
image_digest = (root / 'image-digest.txt').read_text().strip()
response = json.loads((root / 'smoke-response.json').read_text())
verification_id = str(uuid.uuid4())
artifact = f'infra/brev/evidence/verification-{verification_id}.json'
now = dt.datetime.now(dt.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
record = {
    'deploymentId': verification_id,
    'brevInstanceId': os.environ['BREV_INSTANCE_ID'],
    'containerId': os.environ['GPU_CONTAINER_ID'],
    'gpuName': gpu[0].strip(),
    'gpuUuid': gpu[1].strip(),
    'runtime': 'llama_cpp_cuda',
    'imageDigest': image_digest,
    'modelId': 'atlas-specialist',
    'modelRevision': '91cad51170dc346986eccefdc2dd33a9da36ead9',
    'verifiedAt': now,
    'verificationArtifact': artifact,
}
detail = {'record': record, 'modelSha256': model_sha, 'gpuMemory': gpu[2].strip(), 'smokeResponseId': response['id'], 'computeSamples': correlated}
pathlib.Path(artifact).write_text(json.dumps(detail, indent=2) + '\n')
(root / 'deployment.json').write_text(json.dumps(record, indent=2) + '\n')
print('GPU verification record:', artifact)
PY
