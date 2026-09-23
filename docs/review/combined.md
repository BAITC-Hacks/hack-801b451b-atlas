# Combined OpenAI and Brev GPU verification — 2026-09-23

**G-COMBINED passed** for the deployed revision exercised on 2026-09-23. This record covers a real OpenAI Agents SDK run and a real, same-run NVIDIA L4 inference whose event decisions changed the business result, followed by browser edit, stale-revision rejection, acknowledgment when required, approval, CSV export and persisted refetch. The run used synthetic demo data; partner/1C compatibility remains unverified.

## Deployment and GPU evidence

- Brev instance: `iyfz2jzfd` (`atlas-hackalem-gcp`), GCP NVIDIA L4, 24 GiB VRAM, 129 GB disk; displayed running rate was $0.87/hour. It was running during the recorded verification.
- Full Brev Compose deployment: database, API, web and private `gpu-specialist` containers built and reported healthy. Migrations and seed completed. Seed snapshot: `75163af0-2bb6-488c-87c6-741afdeafbf4`.
- GPU service image: `ghcr.io/ggml-org/llama.cpp` CUDA server manifest digest `sha256:2e323f437c6169a94f9edf5f8b8cf2fca8c70104e4196effa3a3d58f03eefb40` (`server-cuda-b9787`). Model: `Qwen/Qwen2.5-1.5B-Instruct-GGUF`, revision `91cad51170dc346986eccefdc2dd33a9da36ead9`, file SHA-256 `6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e`.
- Startup log reported 29/29 model layers offloaded to GPU and a 934.70 MiB CUDA model buffer. `infra/brev/verify-deployment.sh` passed at `2026-09-23T11:03:49.710Z`. It recorded four inference-correlated `nvidia-smi pmon` samples, with peak SM utilization 18%, plus the specialist smoke response `chatcmpl-PydidE4B3Msc7M4paXIHtmMAi6EretAx`.
- The verifier wrote `infra/brev/evidence/verification-ba8c3ebf-1bde-4e0f-af73-dfa304d6b5ca.json`. This evidence file is intentionally ignored by Git because it contains deployment/runtime details; retain it with the deployment operator. Verification is tied to this instance/runtime and expires after restart or runtime/image/model changes. Rerun the deployment verifier and retain fresh evidence after any such change.
- The Brev services remained private. The operator used SSH loopback forwarding to local `127.0.0.1:3002`, with `WEB_ORIGIN` set to that same origin; internal service ports were not made public.

## End-to-end run

The production-built browser workflow was exercised against the Brev Compose stack with:

```powershell
$env:ATLAS_BASE_URL = 'http://127.0.0.1:3002'
$env:ATLAS_EXPECT_GPU = 'success'
pnpm --filter @atlas/web e2e:local
```

It passed with run ID `a162030e-9c3b-459c-b106-632881838e4d` and dataset `75163af0-2bb6-488c-87c6-741afdeafbf4`. The same run recorded:

- OpenAI model `gpt-4.1-2025-04-14`: success, 6,631 ms.
- Brev model `atlas-specialist`: success, 1,856 ms; inference response `chatcmpl-pxfBCMQsOdBq0ain1NYUxjDc4Hr4DvuP`. Its request interval, `2026-09-23T11:21:51.208Z`–`2026-09-23T11:21:53.053Z`, matched the running deployment and instance above.
- Real `inspectDemand`, `classifyEvents` and `calculateOrders` tool actions and persisted draft. The browser edited the six-line draft; stale revision update returned HTTP 409; it acknowledged warnings when required, approved revision 3, downloaded the English CSV (1,507 bytes), and reloaded/refetched the same approved revision. Switching locale did not start another run.

## Material business effect

For comparison, a degraded run on the same seeded dataset (`1da5985d-1f4e-48fc-9135-a7e56e5dafba`) had 4 candidate events pending and 1 hard exclusion, with 610 excluded units total. The successful GPU run classified 1 event as retain, 2 as exclude and 1 as pending, in addition to the same hard exclusion, with 545 excluded units total. Thus the verified specialist changed event-level retain/exclude/review decisions and reduced excluded units by 65. Total recommended quantity remained 281 in both runs. The evidence supports a material event-decision effect; it does not show that GPU inference changed the final recommended total for this seed.

## Reproduction and cost

Use the pinned image and model in `infra/brev/compose.gpu.yaml`, provisioned Brev GPU instance, and the ignored server-side deployment environment. Complete the deployment verification script first, then run the browser command above through the SSH loopback tunnel. Do not treat a configured endpoint, healthy container, GPU presence, HTTP 200, or model load alone as inference proof; the verification must correlate actual inference with GPU compute and the application run.

The recorded instance rate was $0.87/hour while running. Stop the instance in Brev when GPU use is finished, then confirm its billing state; stopping containers alone does not stop instance charges. Earlier Crusoe and AWS UI attempts timed out, and a Nebius L40S attempt failed on provider VPC quota. No support contact was made.
