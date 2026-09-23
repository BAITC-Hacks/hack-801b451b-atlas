# Final checklist — execute after feature freeze

All boxes start unchecked. Planning generated commands, not runtime evidence. Ivan owns shared evidence/final README; Beka/AI send lane results. Use current commit and contract v1.1. See execution-conventions.md for exact script producers and env loading; missing script/check is incomplete, never automatically passed.

## Clean reproduction and configuration

- [ ] In a fresh checkout, `pnpm install --frozen-lockfile`, `pnpm -r --if-present typecheck`, `pnpm -r --if-present build`. Confirm all five packages actually ran scripts; `--if-present` cannot excuse a missing required script. Record versions/commit/exit status.
- [ ] Ignored local `.env` matches `.env.example`: DATABASE_URL, OPENAI_API_KEY/MODEL, GPU_SERVICE_URL/MODEL_ID/VERIFICATION_PATH, DEMO_OPERATOR, WEB_ORIGIN, API_INTERNAL_URL and actual deployment GPU_RUNTIME/GPU_IMAGE/model/cache fields. No secret values in examples. Conditional NGC key only when chosen image/model requires it; no hosted NVIDIA entitlement inferred.
- [ ] On Brev: `docker compose -f compose.yaml -f infra/brev/compose.gpu.yaml config --quiet` then `docker compose -f compose.yaml -f infra/brev/compose.gpu.yaml build` and `docker compose -f compose.yaml -f infra/brev/compose.gpu.yaml up -d`. Do not print expanded config containing secrets. Do not delete partner volumes for a clean test; use a fresh isolated demo deployment.
- [ ] `docker compose -f compose.yaml -f infra/brev/compose.gpu.yaml exec -T api pnpm --filter @atlas/db migrate` then the same prefix with `pnpm --filter @atlas/db seed`. Seed disclosed/idempotent, valid source/hash/asOf; labels include synthetic. API image must contain workspace/smoke tooling per B01/B11.
- [ ] `docker compose -f compose.yaml -f infra/brev/compose.gpu.yaml exec -T db pg_isready -U atlas -d atlas` succeeds. `curl -fsS http://localhost:3000/api/v1/health` via Brev UI SSH forwarding returns actual DB health; `curl -fsS http://localhost:3000/api/v1/datasets` returns seed summary.
- [ ] DB/API/GPU ports are private; only web host-loopback3000 accessed through SSH tunnel. Actual proxy preserves `/api/v1` and Origin. No public GPU endpoint required, no Docker socket mounted in API/web.

## Real OpenAI and Brev NVIDIA GPU proof

- [ ] OPENAI_API_KEY set only server-side; `docker compose -f compose.yaml -f infra/brev/compose.gpu.yaml exec -T api pnpm --filter @atlas/ai exec tsx scripts/openai-smoke.ts` performs a real request/tool loop and validates output. Record model/response/time, not key. Harness callbacks here are disclosed; next app gate uses actual backend tools.
- [ ] Brev instance is reachable/running; record actual ID, remaining compute credits/quoted cost and planned shutdown. Host `nvidia-smi` succeeds.
- [ ] `bash infra/brev/bootstrap.sh`/verification shows container runtime can access GPU, compatible CUDA and actual selected GPU model/container started. NIM preferred when feasible; if gated use the specified small CUDA workload and disclose actual choice.
- [ ] Private G02 readiness succeeds with expected model; `bash infra/brev/gpu-smoke.sh` performs actual G01 inference; `bash infra/brev/verify-deployment.sh` produces current measured deployment record. Cold download/warmup timing reported separately from cached ready latency.
- [ ] Inspect GPU-offload/profile logs and inference-correlated compute telemetry with actual Brev instance/container/GPU/model identity; GPU listing/VRAM/HTTP200 alone does not pass. After restart invalidate and regenerate verification record.
- [ ] `docker compose -f compose.yaml -f infra/brev/compose.gpu.yaml exec -T api pnpm --filter @atlas/ai exec tsx scripts/gpu-smoke.ts` validates real returned report/evidence. It calls Docker-network gpu-specialist, never a fake hosted API or CPU substitute.
- [ ] `docker compose -f compose.yaml -f infra/brev/compose.gpu.yaml exec -T api pnpm --filter @atlas/ai exec tsx scripts/integration-smoke.ts` proves A01 consumes actual GPU output into T02 and materially changes a borderline event action/review/quantity versus same-scope no-specialist counterfactual.
- [ ] `docker compose -f compose.yaml -f infra/brev/compose.gpu.yaml exec -T api pnpm --filter @atlas/api exec tsx scripts/combined-flow.ts` proves HTTP/DB/OpenAI/GPU/edit/approve/export/reload with both runtimes success and current evidence. Correlate this request with GPU compute telemetry, not just earlier warmup.

## Official case and bilingual product

- [ ] `pnpm --filter @atlas/api exec tsx --test test/calculation.test.ts test/case-requirements.test.ts` and `pnpm --filter @atlas/api exec tsx scripts/case-proof.ts`:80/60/94 arithmetic, each source sensitivity, seasonal peak, sustained growth, stockout demand>raw, isolated100× spike immunity including split customer-day rows, recurring-buyer safeguard. No all-history-average substitute.
- [ ] Browser http://localhost:3000 through Brev forwarding: select/import dataset with privacy confirmation→warehouse/category→Calculate→supplier groups→all reasons/urgency/source contributions→actual OpenAI/GPU evidence. Zero rows inspectable; synthetic data labeled.
- [ ] Edit final quantity with reason, preserve recommendation, acknowledge warnings, explicitly approve, download CSV and reload approved state. Second tab stale revision409/refetch. No sending supplier order. CSV approved quantities/current revision/localized rationale, proper escaping; empty order header-only.
- [ ] RU then EN main flow; locale switch visible, persists, changes no inference state. Empty/loading/error/degraded/success/approval/evidence all translated, no clipped Russian labels. `pnpm --filter @atlas/web exec tsx --test test/messages.test.ts` passes; no important component literals.
- [ ] C13 output compatibility: preserve source SKU/supplier/unit codes and exact documented CSV. If partner sample/mapping accepted, record evidence. Otherwise mark **UNVERIFIED REQUIRED EXTERNAL GAP**, not a passed accounting integration; no invented partner schema. This gap does not stop independent coding but remains a submission limitation.

## Failure, reliability and secrets

- [ ] `pnpm --filter @atlas/api exec tsx --test test/import.test.ts test/orders.test.ts test/reliability.test.ts` validates malformed/oversized/duplicate/PII-shaped input, safe errors, stock gaps, source integrity, origin rejection, immutable approved revisions and warning acknowledgment.
- [ ] `pnpm --filter @atlas/ai exec tsx --test test/failures.test.ts test/redaction.test.ts` covers OpenAI timeout/auth/max turns, GPU timeout/not-ready503/malformed/wrong IDs/unverified/stale record, bounded retries/abort/fallback and no secret payload leakage. Test injected failures explicitly labeled; not successful runtime evidence.
- [ ] Live failure drill: `docker compose -f compose.yaml -f infra/brev/compose.gpu.yaml stop gpu-specialist`. In UI create a fresh run with candidates. Observe GPU_WORKLOAD_UNAVAILABLE, brev_gpu failed, null specialist/evidence, deterministic provisional exclusions and required acknowledgment. No cached previous success badge or fabricated report.
- [ ] Recovery: `bash infra/brev/restart.sh`, fresh readiness/verification, repeat combined-flow. A configured route/new container cannot reuse stale GPU success record.
- [ ] Live OpenAI failure: using an isolated demo API process with missing/invalid key (never overwrite real key in tracked files), trigger a run and confirm openai failed, null decision and truthful deterministic fallback or contract error. Restore actual environment and repeat real OpenAI smoke. Do not expose key in command history/evidence.
- [ ] Frontend production bundle/network contains no OpenAI/NGC/database secrets or direct GPU requests. `git diff --check`; inspect `git ls-files` for env/private evidence/model weights; scan source for credential references without printing actual secret values. API logs safe and model data minimized.
- [ ] UI visual/keyboards/overflow checks in FRT07; no fabricated GPU indicators or generic fake metrics. No new features after240min.

## Documentation, audit and submission

- [ ] README commands were actually executed; explains methodology/outlier rules, OpenAI versus Brev, actual GPU model/image/location/private endpoint, real smoke reproduction, env, conditional registry requirements, cold start/runtime limits, truthful degradation and known C13/privacy/scope limitations.
- [ ] Disclose generic harness/templates, tsx/libraries and applicable licenses, selected GPU model/image/revision/license, synthetic input provenance and external resources. Do not claim pre-existing tools built during competition.
- [ ] Sentinel INTEGRATION (B12) and JUDGE (B14) findings addressed or explicitly open. Sentinel FULL at final candidate B15; DIFF only after scoped fixes. Sentinel never edits code or performs approval/deployment writes.
- [ ] Beka FRT08 and Ali AI08 provide current evidence. Record commit/run/dataset hashes/time/status in docs/review/final.md; distinguish configured from actually executed on GPU.
- [ ] Stage only owned changes, meaningful commits, clean pull/rebase, rerun changed gate if integration changes, push and verify remote branch matches local HEAD. Use `git status --short`, `git log -1 --oneline`, `git ls-remote origin refs/heads/main` for the default workflow. No fabricated hourly progress commits or force-push.
- [ ] After judge demo and any agreed availability window, stop actual Brev instance using verified UI/CLI and record status; stopping only container does not establish stopped VM billing. Retain reproducible code and safe evidence; no destructive volume deletion.

Completion is factual: any missing real GPU computation/application effect, failed official mandatory check or unavailable access stays red and visible. Configuration success never substitutes for runtime proof.
