# Brev deployment record

Status: **GPU runtime and combined application gate verified** on 2026-09-23. The deployed instance is Brev GCP NVIDIA L4 `iyfz2jzfd` (`atlas-hackalem-gcp`), 24 GiB VRAM and 129 GB disk, at a displayed $0.87/hour running rate. The full Brev Compose stack (database, API, web and private GPU specialist) built and became healthy; migrations and deterministic synthetic seed completed. The successful combined workflow and its actual event-decision effect are recorded in [combined verification](../../docs/review/combined.md).

## Runtime pins and evidence

- CUDA service image: `ghcr.io/ggml-org/llama.cpp` manifest digest `sha256:2e323f437c6169a94f9edf5f8b8cf2fca8c70104e4196effa3a3d58f03eefb40` (`server-cuda-b9787`).
- Model: `Qwen/Qwen2.5-1.5B-Instruct-GGUF`, revision `91cad51170dc346986eccefdc2dd33a9da36ead9`, file SHA-256 `6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e`.
- Startup logs reported 29/29 layers offloaded to GPU and a 934.70 MiB CUDA model buffer. The deployment verifier passed at `2026-09-23T11:03:49.710Z` and captured four inference-correlated `nvidia-smi pmon` samples, peak SM utilization 18%, and specialist smoke response ID `chatcmpl-PydidE4B3Msc7M4paXIHtmMAi6EretAx`.
- Ignored evidence record: `infra/brev/evidence/verification-ba8c3ebf-1bde-4e0f-af73-dfa304d6b5ca.json`. It is local-only and not committed. Regenerate it after any restart, image/model change, or runtime change; prior verification must not be treated as current after that point.
- The same-run browser E2E run was `a162030e-9c3b-459c-b106-632881838e4d`. It recorded successful OpenAI and GPU calls; GPU response ID `chatcmpl-pxfBCMQsOdBq0ain1NYUxjDc4Hr4DvuP` matched the deployment. Full details and impact comparison are in the [combined record](../../docs/review/combined.md).

The application services remained private. Access used SSH loopback forwarding to `127.0.0.1:3002`; `WEB_ORIGIN` matched that origin. No internal service port was exposed publicly. Keep provider credentials and deployment secrets in ignored local environment files or provider secret fields only.

## Reproduction and shutdown

With the verified deployment running, tunnel the web origin to local port 3002, then run from the repository root:

```powershell
$env:ATLAS_BASE_URL = 'http://127.0.0.1:3002'
$env:ATLAS_EXPECT_GPU = 'success'
pnpm --filter @atlas/web e2e:local
```

The GPU test requires the running Brev Compose deployment, migrated/seeded database, configured server-side OpenAI credentials and a current verification record. Use `infra/brev/verify-deployment.sh` to produce fresh deployment evidence before treating GPU status as verified. A configured URL, healthy container, model load, GPU presence or HTTP success alone is not proof of inference on GPU.

After GPU work, stop the instance in Brev and confirm billing has stopped. Container shutdown alone leaves compute charges active. The recorded running rate was $0.87/hour.

## Provisioning history

The first approved Crusoe L40S and alternate AWS L40S UI deployments returned provider timeouts; no instances appeared from those attempts. A CLI Nebius L40S request returned instance `lirwuc84c` but failed with provider VPC quota exhaustion (`vpc.pool.count`). The GCP L4 request created `iyfz2jzfd`, which became the verified running instance described above. No support contact was made.

The 10-minute NVIDIA NIM fit/access check did not establish a usable small instruction NIM profile or deployment credential, so the pinned llama.cpp CUDA/Qwen runtime above was used. No NGC key or hosted NVIDIA inference entitlement is assumed.
