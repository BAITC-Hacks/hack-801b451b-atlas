#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
rm -f infra/brev/evidence/deployment.json
docker compose -f compose.yaml -f infra/brev/compose.gpu.yaml up -d --force-recreate gpu-specialist
ready=0
for _ in $(seq 1 60); do
  if docker compose -f compose.yaml -f infra/brev/compose.gpu.yaml run --rm --no-deps gpu-probe -fsS --max-time 2 http://gpu-specialist:8000/v1/models -o /dev/null >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 10
done
if [[ "$ready" != 1 ]]; then
  echo 'GPU model did not become ready within ten minutes' >&2
  exit 1
fi
bash infra/brev/gpu-smoke.sh
bash infra/brev/verify-deployment.sh
