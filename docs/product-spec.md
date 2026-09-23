# Atlas Replenishment — product specification v1.1

Status: specification only. Resource correction: **$50 NVIDIA Brev GPU compute credits**, with no hosted inference entitlement assumed. Feature IDs below are commitments, not implemented capabilities. Source: [official case](case.md). Contracts: [HTTP](api.md), [AI/tools](ai-contract.md).

## Product

A bilingual replenishment workbench that converts anonymized warehouse history into explainable supplier order drafts, excluding exceptional sales and requiring a manager's approval.

## User

Purchasing manager at Elektokomplekt. Main problem: infrequent manual Excel calculations confuse regular demand with exceptional orders and miss seasonal demand, growth and stockout losses.

## Main scenario

Load a visibly synthetic 24-month dataset (one warehouse, six SKUs, two categories, two suppliers); select warehouse/category; run the agent; inspect a seasonal SKU, a growing SKU, a stockout SKU, an isolated large customer order and a recurring large buyer; inspect the live OpenAI record and Brev GPU execution evidence; adjust one quantity, acknowledge warnings, approve locally and download supplier-grouped CSV. Switch RU/EN without recomputation. Judge independently changes inbound stock and reruns to see quantity change.

## MUST

Exactly **8** features; all official must-haves are included.

| ID | Deliverable / pass condition | Owner |
|---|---|---|
| F01 | Strict normalized JSON dataset import + disclosed synthetic seed; all official input sources, immutable snapshot/provenance, warehouse/category selection | Ivan |
| F02 | Deterministic replenishment: seasonality, sustained growth, external uplift, category policy, stockout compensation, stock and eligible inbound; numeric contributions and targeted fixtures | Ivan |
| F03 | Customer-day outlier detection/exclusion with distinct classification inference on the NVIDIA GPU in Brev and conservative failure handling | Ivan (rules), Ali (GPU workload/adapter; separate files) |
| F04 | Real OpenAI Agents SDK tool loop observes data, calls specialist/calculator, returns validated review decision; bounded run, truthful OpenAI/GPU/tool trace | Ali |
| F05 | Supplier-grouped table, every SKU including zero orders, quantity explanation and urgency; editable positive/zero final quantity, persistent approval/audit and CSV download | Beka (UI), Ivan (API/storage) |
| F06 | RU/EN message dictionaries, visible switcher and complete demo/state translations | Beka |
| F07 | Reliable demo: strict validation, OpenAI/GPU workload timeouts/degraded states, server-only secrets, local access boundary, conflict-safe approval, honest failures | Ivan (API), Ali (AI), Beka (UI) |
| F08 | Reproducible workspace/Compose, migrations/seed, minimal tests, verified README/runbook, disclosures and requirement evidence | Ivan |

## SHOULD

A small category trend chart; urgency sorting; extra partner-format adapter after receiving a sample. No SHOULD work before all MUST functionality and baseline reproduction pass.

## CUT

Supplier messaging, live 1C integration, arbitrary Excel ingestion/UI column mapping, supplier optimization/MOQ, purchasing budgets, multiwarehouse transfer planning, chat UI, vector database/RAG, custom model training, jobs/queues, streaming, production accounts/roles and public deployment. Handling a supplied partner exchange format is still an explicit compatibility obligation, not silently waived by this cut.

## First vertical slice

One seeded SKU with normal sales plus a large customer-day event: PostgreSQL snapshot → Fastify run → real OpenAI inspect tool → real Brev GPU classify tool → deterministic calculation tool → persisted draft → Next.js numeric result and OpenAI/GPU evidence → explicit local approval → CSV. OpenAI access plus an actual Brev NVIDIA GPU inference run with model access and GPU execution evidence must work to claim this slice passes; an offline preview does not pass. Build this before adding the other forecast fixtures.

**Execution timing (PROMPT-1):** W0 0–60min, W1 60–135, W2 120–195, W3 195–240, W4 240–300. Prove an early OpenAI UI/API slice by ~90min using the honest GPU-unavailable branch if necessary; this does not complete W1. Combined GPU/approval/export proof closes W1 by ~135min. Full MUST by ~195, reliability/reproduction by240, then freeze. NIM feasibility gets at most10 minutes in the deployment task; downloads proceed in parallel with product work. See [global waves](waves.md).

## Agentic workflow

Goal: prepare an auditable regular-demand order draft and identify exceptions needing manager attention.

1. Backend validates and stores immutable input; binds tools to one run/snapshot/warehouse/filter.
2. OpenAI calls `inspectDemand` and observes deterministic candidates, data warnings and source summaries.
3. OpenAI calls `classifyEvents`; the Brev-local GPU workload assesses candidate recurrence/concentration, including split same-day customer sales. No raw customer IDs, names or sales rows leave the backend.
4. OpenAI calls `calculateOrders`; a wrapper passes only the cached validated specialist report to the deterministic backend. The model cannot supply quantities, arbitrary exclusions or data IDs.
5. OpenAI returns a typed disposition with SKU/evidence references. Any unresolved data, anomaly, OpenAI problem or GPU workload problem forces attention. Invalid references fail validation.
6. Backend retains numeric truth from calculation, generates localized explanation data and persists draft plus actual evidence. UI shows proposed exclusions and review flags.
7. Manager edits quantities, acknowledges attention flags and explicitly approves the current revision. AI has no approval/send tool. CSV download never transmits an order to a supplier.

### Frozen calculation methodology (F02/F03)

Version `replenishment-v1`; all dates are calendar dates, history ends strictly before `asOf`. Calculations scoped to warehouse and SKU; output includes all matching catalog SKUs. Whole units, round only final order upward. Unit price is evidence for event value, never converted into unit demand.

1. Aggregate sales by SKU/customer token/day before outlier detection (no order ID exists in case). For each event, use positive customer-day quantities from the preceding 90 days, excluding the event itself: median `m`, median absolute deviation `MAD`. Candidate when `q > max(6*m, m+6*MAD)` with >=8 prior positive observations. Count prior same-customer events within [0.5q,2q] on distinct days in those 90 days as `recurrenceCount`. Sparse history warns and uses no unsupported exclusion. `hardOneOff = q >= 10*m AND recurrenceCount < 3`. Hard one-offs are always excluded. For remaining candidates: GPU specialist `one_off` with confidence >=0.8 excludes; `recurring` with confidence >=0.8 AND recurrenceCount >=3 retains; otherwise exclude provisionally and require review. With no verified GPU specialist result, hard one-offs still exclude; all other candidates exclude provisionally and require review. Never restore a hard one-off because of an LLM claim.
2. Build daily cleaned series, including zero-sale calendar days. An excluded event contributes zero; other sales on that day remain. For a stockout day, impute `max(cleaned actual, median non-stockout daily cleaned demand in the preceding 56 days)`; at least 7 eligible prior days required. Otherwise leave actual and flag `INSUFFICIENT_HISTORY`. Imputation uses observed days only, never other imputed days; merge overlapping stockouts. Record additional units as lost demand. The raw comparison uses the same exclusions but disables only this imputation.
3. Using the last 12 complete calendar months, compute each month's mean corrected daily demand divided by the day-weighted annual daily mean. Clamp indices to [0.25,4] and renormalize to day-weighted mean 1. Missing complete annual coverage or zero annual mean: factors 1, explicit `INSUFFICIENT_HISTORY`. This is a small seasonal heuristic, not a statistical accuracy guarantee.
4. Deseasonalize corrected daily demand by its month index. `baseDaily` = mean for last 28 days. `priorDaily` = mean for preceding 28. Set `trendFactor = clamp(baseDaily/priorDaily,1,1.5)` only if priorDaily>0 and at least 3 of the four latest weekly means exceed their corresponding previous-four-week means; otherwise 1. Clamp hits produce `CAPPED_TREND`. Insufficient 56-day coverage produces zero recommendation and `INSUFFICIENT_HISTORY`, not invented sales.
5. Category supplies `reviewDays`, `safetyDays` and residual `plannedGrowthPct` (0..100). `horizonDays = supplier.leadTimeDays + reviewDays + safetyDays`. `seasonFactor` = mean seasonal index across dates asOf through asOf+horizonDays-1. `forecastDaily = baseDaily * seasonFactor * trendFactor * (1+plannedGrowthPct/100)`. `targetUnits = forecastDaily * horizonDays`.
6. `stock` = latest stock snapshot on/before asOf (required); stale >7 days warns. `eligibleInbound` = sum positive remaining quantities with ETA in [asOf,asOf+horizonDays-1]; overdue inbound is excluded and flagged, later inbound is reported separately. `recommendedQty = ceil(max(0,targetUnits-stock-eligibleInbound))`. `rawSalesQty` repeats steps 3–6 without stockout imputation. Preserve every contribution and excluded-event ID. No double counting current stock with the 1C statement: the statement maps into catalog/stock inputs, not a second inventory source.
7. Urgency: `none` if recommendedQty=0; else `high` if forecastDaily>0 and stock/forecastDaily < leadTimeDays; otherwise `normal`. This is coarse on-hand risk, not a dated inventory optimization. Supplier grouping is deterministic.

Fixtures must demonstrate: exact arithmetic (base 10/day, factors 1, horizon 14, stock 40, inbound 20 => 80 units); inbound +20 =>60; category horizon +1 =>+10; external uplift +10% =>94; seasonal peak > off-season; sustained weekly rise > flat-demand counterfactual; stockout compensated > raw; isolated 100× spike changes order by <=max(1,5% baseline), including split same-customer/day rows; recurring candidate cannot be restored without recurrence evidence. Choose unsaturated fixtures to demonstrate each source's influence. Missing-data warnings are not a substitute for those positive tests.

## OpenAI role

Primary agent/control plane using `@openai/agents` inside `packages/ai`. Receives scope, safe tool summaries, specialist evidence and calculated rows. Returns `AgentDecision` (disposition, calculation ID, bounded evidence-linked attention items); no generated quantity is authoritative. It chooses tools and reacts to observations; backend enforces the required inspect/classify/calculate sequence and review minimums. Demo shows real tool order, elapsed times, OpenAI model and GPU deployment IDs and final disposition. See [AI contract](ai-contract.md).

The SDK supports an application-owned agent/tool loop and structured agent outputs; our backend retains state and approval authority. References checked for this specification: [Agents SDK](https://developers.openai.com/api/docs/guides/agents/sdk), [agent definitions](https://developers.openai.com/api/docs/guides/agents/define-agents).

## NVIDIA role

Brev supplies **GPU compute/runtime**, not a hosted model API. A self-hosted instruction model on the Brev NVIDIA GPU classifies large customer-day events as `one_off`, `recurring` or `uncertain`, with confidence and evidence codes. Numeric candidate features enter a typed internal HTTP call; validated `SpecialistReport` changes borderline exclusion/retention and review under the unchanged safeguards above. It does not paraphrase OpenAI. No raw customer IDs leave the backend.

**Deployment choice:** prefer a small instruction-model NVIDIA NIM if its image/model is accessible, fits the selected GPU and can be ready quickly. Ali/Ivan timebox that check to 10 minutes; record the chosen image digest/model/profile. If access, download size or GPU fit blocks it, use one `llama.cpp` CUDA server container with `Qwen/Qwen2.5-1.5B-Instruct-GGUF` Q4_K_M, pinned model revision/file checksum and image digest after smoke verification. This is a real alternative GPU runtime, never an offline-result fallback. No training or additional wrapper service. Both expose chat inference to the adapter in `packages/ai`; the adapter owns the case-specific rubric and Zod validation. Small-model quality and latency must pass real fixture checks; otherwise the live GPU milestone is blocked, not simulated.

NGC credentials, only if required by the selected NIM image/model, are deployment/download secrets; the $50 credit is not a credential or model-access entitlement. No hosted NVIDIA key is configured. See [Brev containers](https://docs.nvidia.com/brev/guides/development-tools/custom-containers), [NIM prerequisites](https://docs.nvidia.com/nim/large-language-models/latest/get-started/prerequisites.html), [llama.cpp CUDA images](https://github.com/ggml-org/llama.cpp/blob/master/docs/docker.md), and the [fallback model card](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF).

Demo proof: real OpenAI response; Brev instance/GPU identity; deployed image/model and GPU-offload logs; inference request/time correlated with GPU process/compute activity; returned classification; and its effect on a borderline event's retention or review. A GPU listing, allocated VRAM or HTTP 200 alone is insufficient. Use the same run with the specialist disabled as a counterfactual: a validated recurring candidate is retained (only with recurrenceCount>=3) versus provisional exclusion/review when unavailable. Persist both outcomes honestly; never force the live model's label to make the demo pass.

## Provider failure/degraded behavior

| Boundary | Limit | Retry | Truthful result |
|---|---|---|---|
| OpenAI | 15s per model request; max 6 model turns; whole AI run 90s | At most 1 transient retry total for this provider/run; SDK automatic retries disabled | Deterministic draft with `openai=failed`, no invented decision; requires review |
| Brev NVIDIA GPU workload | 10s warmed inference request; one batch <=24 candidates; 2s readiness probe | At most 1 transient retry; none on invalid schema/GPU verification failure | `brev_gpu=failed`, `GPU_WORKLOAD_UNAVAILABLE`; no classifications; provisional exclusions and human review |
| Backend tools | 5s each; max 3 tool invocations in normal sequence | No retry, read-only calculation may be rerun by deterministic fallback | No draft if required data/calculation fails; HTTP error |

Abort all calls at the 90s AI deadline (retries count inside it). Transient=network/429/5xx; bounded <=500ms backoff. Backend may spend a further 5s on deterministic fallback and 5s persisting; web timeout 110s. SDK tracing must not export sales payloads; persist only approved redacted evidence locally. An interrupted request must abort work or finish one persisted run, never approve. If no candidates exist, `brev_gpu=skipped/no_candidates`, not successful GPU inference; this run cannot prove OpenAI + Brev GPU integration. Candidate overflow is a validation error, not silent truncation. Configure the web proxy to respect the same request budget. Any OpenAI failure or GPU workload unavailable/timeout/unverified state makes the draft degraded and requires warning acknowledgment. Missing critical input or failed deterministic calculation => no order result.

## Bilingual UX

`apps/web/src/messages/ru.ts` and `en.ts` expose identical nested keys: `common`, `dataset`, `run`, `orders`, `approval`, `evidence`, `errors`, `warnings`. Visible RU/EN switcher; RU initial default; persist locale locally. Never put user-facing string literals in React components. Include labels, numeric explanation templates, OpenAI/GPU workload states, validation/empty/loading/error/success, approval confirmation and exported rationale in both languages. API returns stable codes + numeric values; UI renders them from dictionaries. Product/supplier names are source data, not UI copy. CSV explanations use server-owned equivalent RU/EN templates. Locale change does not call OpenAI or rerun GPU inference. Include RU/EN copy for GPU warming, unavailable, timeout and unverified states.

## Architecture

Deploy one Docker Compose project on Brev: `web → api → PostgreSQL/Drizzle`; `api → packages/ai → OpenAI API`; and `packages/ai → http://gpu-specialist:8000/v1/chat/completions` on the Compose network. `gpu-specialist` is a NIM **or** the CUDA server alternative, never both. It has an NVIDIA GPU reservation and a persistent model cache. This is the single necessary GPU service boundary. Browser never calls inference directly.

One API process; synchronous bounded runs, no queue/streaming. Web uses same-origin `/api` proxy. DB entities remain datasets (immutable JSON/hash), runs (scope/evidence/revision), lines and approval audit. Contracts are Zod/inferred TypeScript; AI has no DB credentials. Core containers: web, api, db, gpu-specialist. Keep db/api/GPU ports private; bind web to Brev-host loopback and access through SSH forwarding for the single-operator demo. Do not publish an unauthenticated inference port or expose the Docker socket to the application.

Ivan owns Compose/GPU reservation/cache/network/readiness configuration; Ali owns the GPU adapter, rubric and GPU adapter validation/smoke helpers inside `packages/ai/**`; hardware verification record/bootstrap remain Ivan-owned in `infra/brev/**`. Bootstrap downloads/warms the model before demo requests; cold start is a deployment dependency outside the 90s inference budget. API may start in an explicitly degraded state if the GPU service is unavailable. Local machines without NVIDIA hardware may exercise degraded UI only; CPU inference cannot satisfy GPU proof. GPU readiness requires a current deployment verification record as defined in ai-contract.md, not just service health. [Compose GPU support](https://docs.docker.com/compose/how-tos/gpu-support/).

**Budget:** the user reports $50 Brev compute credits; no GPU SKU, hourly rate or spending headroom has been verified. Before execution provisioning, check the actual instance quote and included/storage charges; choose the smallest GPU that fits. Ivan caps runtime so quoted total stays within remaining credits, records instance/runtime cost, and stops the instance after verification/demo. Do not assume stopping containers stops VM billing. No resource is provisioned during START.

## Stack additions/deviations

Default frontend/backend/database, OpenAI Agents SDK/API and pnpm remain unchanged. Replace the hosted NVIDIA assumption with this focused GPU deployment. Native fetch handles internal HTTP; no extra JS framework. Execution uses the small dev-only `tsx` runner with Node built-in tests to avoid a separate test framework.

| Addition | Reason | Owner | What custom work it removes | Risk |
|---|---|---|---|---|
| Optional one-shot pinned curl probe image | Raw Docker-network GPU smoke before API image exists | Ivan: infra/brev | Custom HTTP probe implementation inside inference image | Download/architecture compatibility; test helper only |
| Dev-only tsx runner | Execute TypeScript smoke/fixture scripts and Node tests without a second build loop | Ivan: dependency/lockfile | Separate test framework and repetitive compile wrappers | Pin compatible Node/TypeScript versions |
| Brev GPU instance + Compose GPU service | Use actual $50 compute resource for anomaly classification inference | Ivan: deployment/shared files | Separate cluster/orchestration setup | Availability, quoted cost, drivers and warmup |
| NVIDIA NIM, when quick/accessible | Ready-made GPU inference runtime for the specialist | Ali: runtime selection/adapter; Ivan: image config | Custom model serving | Model/profile memory, downloads, conditional NGC access |
| Conditional alternative: llama.cpp CUDA server + Qwen2.5-1.5B-Instruct GGUF Q4_K_M | Small public-weight workload if NIM is blocked | Ali: adapter/rubric/verification; Ivan: Compose/cache | Training, Python serving stack and custom GPU kernels | Small-model classification quality; CUDA/image compatibility |

Choose one inference runtime at the feasibility gate and freeze its adapter contract. Model/image access and GPU execution remain unverified until actually run. No other service or dependency is added.

## Ownership

| Writer | Exclusive paths / responsibilities |
|---|---|
| Ivan | `apps/api/**`, `packages/db/**`; all shared root package/workspace/config files, lockfile, Docker/Compose, `.env.example`, `packages/contracts/**`, root README, `AGENTS.md`, `docs/**`, root verification scripts/fixtures; `infra/brev/**` (single GPU deployment/runtime owner) |
| Beka | `apps/web/**` including dictionaries and UI-owned tests |
| Ali | `packages/ai/**` including OpenAI/GPU adapters, specialist rubric, GPU verification helpers and AI-owned tests |

Ivan owns every shared file; package additions from other lanes are requested through him if root/lockfile changes are needed. Application Dockerfiles/base Compose remain at root; Brev-specific overlay, bootstrap and hardware evidence belong only in `infra/brev/**` (Ivan). Feature collaboration never grants overlapping writes. START contained no tasks; PROMPT-1 tasks are in docs/backend, docs/frontend and docs/ai.

## Known risks

- No partner V2/1C sample or import specification supplied. Normalized JSON/synthetic fixtures allow development; verified accounting compatibility awaits the actual format. Record unresolved status in final submission if still absent.
- OpenAI access, Brev GPU availability/cost, NIM access and alternative CUDA model deployment are untested in START. Verify real GPU execution and classification quality before claiming the slice. No fabricated result when unavailable.
- Heuristics need enough history and cannot prove business forecast accuracy in five hours. Synthetic fixtures demonstrate requirements, not real savings. Recurring bulk sales and category-level trends may need later tuning.
- One local operator, small imports (<=12 SKUs/20,000 sale rows/5 MiB), full-day stockouts and whole units only. Larger/unsupported inputs fail clearly. Partner scale is unknown.
- Price/currency and catalog labels are retained for traceability; forecasting is unit-based. Export mapping and residual-growth interpretation require partner confirmation.
