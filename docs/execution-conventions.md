# Execution conventions — frozen PROMPT-1 interface

All commands in task packets are **targets to implement**, not already verified commands. Only Markdown exists at generation. Owner of a command must create it before marking its task complete. Run from repository root unless marked Brev; use the same commit and contracts across lanes. Run commands with actual configured server environment, never paste secrets into tracked evidence.

## Names, ports and dependency wiring

Packages: `@atlas/web`, `@atlas/api`, `@atlas/contracts`, `@atlas/db`, `@atlas/ai`. Next web3000, Fastify3001, PostgreSQL5432, private gpu-specialist8000. Base public application URLs `http://localhost:3000` and same-origin `/api/v1`. Next proxies to `API_INTERNAL_URL=http://api:3001` on Brev Compose. Local development can run API on loopback3001 and web on3000. B04 preserves the `/api/v1` prefix. Browser never knows GPU_SERVICE_URL or model credentials.

Root `compose.yaml` (B01/B11) provides web/api/db; **`infra/brev/compose.gpu.yaml` (B06)** adds the one GPU workload. Commands using the overlay run on Brev. `GPU_SERVICE_URL=http://gpu-specialist:8000`; G01 appends `/v1/chat/completions`, G02 `/v1/models`. Do not add `/v1` twice. `gpu-probe` is an optional one-shot curl test helper, never an application service or GPU execution evidence. No public internal ports. Web reachable through SSH forwarding of host loopback3000; no public Brev inference endpoint required.

The architecture path is fixed: API → `@atlas/ai.runReplenishment` → one typed GPU client. B06 raw operational smoke is independent deployment verification, not a second product client. OpenAI decides tool flow; the Brev NVIDIA GPU model classifies numeric sale anomalies; deterministic API tools own quantities. No contract schema copy in lanes.

## Script producers

| Task | Creates / owns executable interface during implementation |
|---|---|
| B01 | Root install/recursive build/typecheck scripts, tsx/TypeScript runner, Node/pnpm pin, base Compose and application Dockerfiles |
| B02 | contracts build/typecheck; test/contracts.test.ts |
| B03 | db migrate/seed/build/typecheck, fixture builder, test/persistence.test.ts |
| B04 | api build/typecheck/start and import.test.ts; server env/config |
| B05 | calculation.test.ts and actual deterministic tools |
| B06 | infra/brev/{bootstrap,gpu-smoke,verify-deployment,restart}.sh; overlay, raw request fixture, deployment record/hardware telemetry |
| B07 | api/scripts/openai-flow.ts; test/runs.test.ts |
| B08 | api/test/orders.test.ts |
| B09 | api/scripts/case-proof.ts; case-requirements.test.ts |
| B10 | api/test/reliability.test.ts |
| B12 | api/scripts/combined-flow.ts (live HTTP approval/export + deterministic no-specialist counterfactual) |
| FRT01 | web dev/start/build/typecheck scripts; message/context foundation |
| FRT02/FRT04/FRT05/FRT06 | web tests transport/review/messages/failure-ui respectively; built-in Node/tsx test runner, no new UI test framework required |
| AI01 | ai build/typecheck; config.test.ts; server-only config/env loader |
| AI02 | ai/scripts/openai-smoke.ts; openai.test.ts |
| AI03 | ai/scripts/gpu-smoke.ts; gpu.test.ts; GPU adapter |
| AI04 | run.test.ts and actual A01 run controller |
| AI05 | ai/scripts/integration-smoke.ts; integration.test.ts |
| AI06/AI07 | failures.test.ts / redaction.test.ts; AI07 refines existing smoke commands |

Each listed test path is under its owning package. Use `pnpm --filter @atlas/<package> exec tsx --test test/<name>.test.ts`. No success placeholder tests. API/AI/DB configuration locates the repository `.env` using native Node env loading where available and preserves already-exported environment values; B01 pins a compatible Node runtime. Smoke scripts reuse that loader, do not duplicate secret handling. Compose loads env securely from ignored local configuration. B01 images retain the test/tsx smoke runner for the hackathon reproduction image; a minimal production image is outside scope.

API smoke scripts running inside the api container call `http://127.0.0.1:3001/api/v1`; on the host they use the same loopback API port from local development, or are run via Compose exec. They attach `Origin: WEB_ORIGIN` and JSON Content-Type on writes; no public API port is added on Brev. The separate browser gate exercises the web proxy. API smoke scripts use the known test dataset returned by seed/import, not a hardcoded production dataset ID. Run/output IDs captured from actual responses. `openai-flow.ts` may pass with GPU absent but must report it; `combined-flow.ts` requires real OpenAI and GPU success, fresh evidence and material effect. B05 publishes `apps/api/src/tools/index.ts` with `createDemandTools({datasetId,warehouseId,categoryId?,runId})`, returning `{scopeId,tools,lookupCalculation}`; it reads the immutable dataset through @atlas/db, validates the scope, and returns contract BackendTools plus request-local calculation lookup. B07 and test-only AI05 use that same factory rather than making different callbacks. Integration harness may directly import API tool factory through a test-only relative import; runtime AI package must not import API/DB or introduce dependency cycles.

## Configuration and proof

Server env: `DATABASE_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `GPU_SERVICE_URL`, `GPU_MODEL_ID`, `GPU_VERIFICATION_PATH`, `DEMO_OPERATOR`, `WEB_ORIGIN`; web **server-only** `API_INTERNAL_URL`. Deployment: `GPU_RUNTIME`, `GPU_IMAGE` digest, actual pinned model file/revision/cache, chosen host quote. Conditional `NGC_API_KEY` only when the selected NIM image/model actually requires it; it is never a Brev compute-credit credential. No external NVIDIA inference endpoint is assumed. All timeouts are frozen constants from contracts (OpenAI15s, GPU10s, GPU readiness2s, AI90s, fallback5s, persistence5s, web110s).

`:configured` is code/schema/endpoint configuration and explicit tests. `:executed` is real model computation with Brev GPU proof and validated result. AI03 development can start before B06 finishes; AI03:executed requires B06:executed. B06's final hardware record is a measured deployment-only subset of GpuEvidence (all fields except inferenceResponseId/requestStartedAt/requestFinishedAt); the client appends those per inference. Restart wrapper invalidates record before process start, and verification regenerates it. Health/VRAM/HTTP success are insufficient.

Only model/output transport test doubles are allowed in unit tests. No production success mock, fake external integration or hardcoded AI answer. Unavailable GPU produces GPU_WORKLOAD_UNAVAILABLE with null specialist/evidence and human acknowledgment. External data/1C gap is reported, never invented.

## Worker and evidence handoff

Worker receives one task, exact scope, dependencies and model. Parent records scope lease in conversation; no extra lock files needed. No workers concurrently write overlapping paths, package manifests or lockfile. Parent releases lease after diff/review/test. Ivan alone updates shared docs, root/lockfile and authoritative evidence; other lanes send results without editing docs. Lane test evidence files are explicitly owned in their packets. GPU raw evidence under infra/brev/evidence (Ivan); redacted shared review docs under docs/review (Ivan). Do not commit private host details/keys; preserve safe evidence IDs and references.

Each result: task ID; changed paths; command/exit/status; actual run/hash/model/record references; configured versus GPU-executed; blocker and downstream impact. Gates need current real evidence, not a checkbox inferred from code. Commit/push real increments around minutes60/120/180/240/300 when runnable; never wait to manufacture a timed empty commit.
