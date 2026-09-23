#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

GPU_IMAGE='ghcr.io/ggml-org/llama.cpp@sha256:2e323f437c6169a94f9edf5f8b8cf2fca8c70104e4196effa3a3d58f03eefb40'
MODEL_REVISION='91cad51170dc346986eccefdc2dd33a9da36ead9'
MODEL_FILE='qwen2.5-1.5b-instruct-q4_k_m.gguf'
MODEL_SHA256='6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e'

command -v nvidia-smi >/dev/null
command -v docker >/dev/null
command -v curl >/dev/null
command -v sha256sum >/dev/null
nvidia-smi --query-gpu=name,memory.total,uuid --format=csv,noheader
docker compose version
docker info --format '{{json .Runtimes}}' | grep -qi nvidia

mkdir -p infra/brev/model-cache infra/brev/evidence
if [[ ! -s "infra/brev/model-cache/$MODEL_FILE" ]]; then
  curl --fail --location --retry 2 --output "infra/brev/model-cache/$MODEL_FILE.tmp" \
    "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/$MODEL_REVISION/$MODEL_FILE"
  mv "infra/brev/model-cache/$MODEL_FILE.tmp" "infra/brev/model-cache/$MODEL_FILE"
fi
printf '%s  %s\n' "$MODEL_SHA256" "infra/brev/model-cache/$MODEL_FILE" | sha256sum --check
sha256sum "infra/brev/model-cache/$MODEL_FILE" > "infra/brev/model-cache/$MODEL_FILE.sha256"
docker pull "$GPU_IMAGE"
docker compose -f compose.yaml -f infra/brev/compose.gpu.yaml config --quiet
echo 'Model cached and CUDA image pulled. GPU inference remains unverified until smoke and deployment verification pass.'
