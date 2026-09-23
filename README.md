# Atlas Replenishment

**Status: planning only.** This repository currently contains the product specification, contract targets and PROMPT-1 execution plans. No application functionality, OpenAI or Brev GPU integration or run commands have been implemented or verified.

## Problem

Purchasing managers consolidate warehouse data manually; seasonality, demand growth, stockouts and exceptional customer orders distort replenishment decisions. [Official case and checklist](docs/case.md).

## Solution

Planned: a small RU/EN workbench that calculates regular-demand replenishment, groups explainable drafts by supplier, lets the manager adjust and approve quantities, and exports an order CSV. Eight MUST features are defined in the [product specification](docs/product-spec.md). Calculation methodology and outlier rules are specified there; they are not yet implemented.

## Architecture

Planned: Next.js → Fastify → PostgreSQL/Drizzle and `packages/ai` → OpenAI agent + deterministic backend tools + Brev-local NVIDIA GPU specialist over private HTTP. Docker Compose on Brev contains web/api/db/gpu-specialist; one API process; human approval remains in the backend. [HTTP contract](docs/api.md) · [AI/tool contract](docs/ai-contract.md) · [evidence map](docs/evaluation-map.md).

## Stack

Planned default: Next.js, TypeScript, Tailwind, shadcn/ui, Lucide; Fastify, Zod, Drizzle, PostgreSQL; OpenAI Agents SDK/API; NVIDIA Brev GPU compute; pnpm workspaces, Git, Codex, Docker Compose. Focused addition: one self-hosted GPU inference container—NIM if quickly feasible, otherwise llama.cpp CUDA with Qwen2.5-1.5B-Instruct GGUF Q4_K_M. [Addition rationale and ownership](docs/product-spec.md#stack-additionsdeviations). Dev tooling adds tsx with Node built-in tests. Intended paths: `apps/web`, `apps/api`, `packages/contracts`, `packages/db`, `packages/ai`.

## OpenAI role

Planned primary agent: select/call scoped tools, observe classification and computed quantities, and return a validated evidence-linked review decision. It cannot approve or invent order quantities.

## NVIDIA role

Resource correction: **$50 of Brev GPU compute credits**. Planned specialist: run model inference on the NVIDIA GPU in Brev to classify large-sale events from anonymous aggregate features; affect outlier retention/exclusion and review flags. Prefer NIM after a short feasibility check; the alternative is a small CUDA inference container, not a simulated output. No hosted NVIDIA inference entitlement is assumed. Any NGC credential required by the selected NIM is a separate deployment secret. No GPU, model inference or OpenAI call has been tested in START.

## Execution plans

[Global waves](docs/waves.md) · [Backend](docs/backend/orchestrator.md) · [Frontend](docs/frontend/orchestrator.md) · [AI](docs/ai/orchestrator.md) · [Final checklist](docs/final-checklist.md). Planning only; future task commands are not yet implemented. GPU deployment has one owner, Ivan, in `infra/brev/**`; application GPU HTTP communication belongs only to Ali in `packages/ai/**`.

## Setup placeholder

TODO after implementation: exact prerequisites/versions and verified fresh-checkout install, environment, database migration, synthetic seed, start, health and build/test commands; Brev instance/driver checks, Compose GPU reservation, model download/cache/warmup, private GPU endpoint and SSH-forwarded UI. Check the actual instance quote against remaining $50 credits and document instance shutdown after demo. Do not treat this document as an executable setup guide yet.

## Environment placeholder

Planned API variables: `DATABASE_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `GPU_SERVICE_URL` (default `http://gpu-specialist:8000`), `GPU_MODEL_ID`, `GPU_VERIFICATION_PATH` (read-only actual deployment evidence), `DEMO_OPERATOR`, `WEB_ORIGIN`; web proxy variable `API_INTERNAL_URL`. Deployment variables: `GPU_RUNTIME` (`nim` or `llama_cpp_cuda`), `GPU_IMAGE` pinned by digest, and selected model cache/revision configuration. `NGC_API_KEY` is conditional only if required for the chosen NIM download/image; never sent in inference requests. Ivan creates the validated `.env.example`; no NVIDIA hosted key/base URL is needed. Keep all secrets out of `NEXT_PUBLIC_*`. Access, image/model compatibility, latency and GPU execution remain unverified.

## Demo/verification placeholder

TODO: one seeded run with a real OpenAI API call and actual NVIDIA GPU inference on Brev, deterministic numeric fixtures, edit/approve/export/reload, OpenAI failure/GPU workload unavailability, RU/EN states and clean Compose reproduction. Record actual results and remaining failures. Planned demo uses realistic, visibly synthetic 24-month input; synthetic outputs cannot substitute for real inference. Record Brev instance/container/model identity, GPU-offload logs and inference-correlated compute evidence; show the GPU classification materially changes borderline retention/review. Stop the GPU service and verify honest degraded behavior. HTTP200 or GPU presence alone is insufficient.

## RU/EN support

Required but not built: RU/EN dictionaries, visible switcher, complete demo-critical loading/error/empty/success/approval copy and localized export explanations.

## Known limitations placeholder

Known now: no V2/1C sample or accepted accounting import schema; CSV compatibility is proposed, not verified. OpenAI access, Brev GPU availability/quoted cost, model/image access and CUDA inference untested. Planned scope is a local single-operator demo, small whole-unit datasets, heuristic forecasts and no supplier sending. TODO: replace/extend with actual implemented limitations and measured checks before submission.

## Disclosures

- Generic planning baseline: `hackalem-v4/templates/AGENTS-TEMPLATE.md` and `hackalem-v4/MODEL-POLICY.md` from the user’s downloaded hackathon pack. Adapted rules are embedded in [AGENTS.md](AGENTS.md). No pre-existing application harness/code was present in the inspected repository; it originally contained only a short README.
- Official source: supplied `CASE-INPUT.md`, preserved verbatim in [docs/case.md](docs/case.md). Partner identifies Elektokomplekt (ekt.kz); no external partner connection has been established.
- External technical references consulted: [OpenAI Agents SDK](https://developers.openai.com/api/docs/guides/agents/sdk), [agent definitions](https://developers.openai.com/api/docs/guides/agents/define-agents), [Brev container deployment](https://docs.nvidia.com/brev/guides/development-tools/custom-containers), [NIM prerequisites](https://docs.nvidia.com/nim/large-language-models/latest/get-started/prerequisites.html), [llama.cpp CUDA containers](https://github.com/ggml-org/llama.cpp/blob/master/docs/docker.md), [Qwen fallback model](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF). Exact dependency versions/licenses and runtime model IDs to be recorded after implementation.
- TODO: record any additional templates/assets, libraries, data provenance, licenses and actual model/runtime usage. No synthetic dataset or runtime inference output has been generated in START.
