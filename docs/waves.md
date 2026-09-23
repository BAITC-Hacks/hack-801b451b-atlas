# Global execution waves — 300 minutes

Status: tasks generated, none implemented or verified. Start the competition clock when execution starts. Contracts v1.1; eight MUST features. Read [execution conventions](execution-conventions.md) and [model policy](../MODEL-POLICY.md). This graph is the complete baseline; orchestrators execute it rather than redesigning scope.

## Wave map

| Wave / target | Goal | Backend tasks | Frontend tasks | AI tasks | Exit gate / dependency |
|---|---|---|---|---|---|
| W0 / 0–60min | Shared contracts, DB/API/UI skeleton; early Brev infrastructure proof | B01→B02→B03→B04; B06 starts alongside DB/API workers | FRT01→FRT02 (B02 schema handoff) | AI01 after B02; begin AI02/AI03 once callable | G-CONTRACTS, G-API and G-GPU-INFRA; GPU image may still download |
| W1 / 60–135min | First OpenAI slice; independent GPU inference; converge on approved real user flow | B05/B06 finish; B07→B08→B12→B13 | FRT03→FRT04 | AI02 and AI03:configured in parallel → AI04; AI03:executed after B06 → AI05 | G-OPENAI by~90; G-GPU-READY/G-GPU-EXEC; G-COMBINED by~135 (includes edit/approve/export) |
| W2 / 135–195min | All remaining MUST functionality/evidence | B09→B14 (also waits FRT05/AI06/B13) | FRT05 | AI06 | G-MUST functional; C13 acceptance remains visible if partner format missing |
| W3 / 195–240min | Reliability/reproduction/bilingual polish; no SHOULD while red | B10 (waits FRT06/AI06) → B11 | FRT06→FRT07 | AI07 | G-RELIABLE including clean Compose and stopped-GPU drill; G-FREEZE at240 regardless of status |
| W4 / 240–300min | No features; final live checks, audit, docs, push | B15 after B11/B14/FRT08/AI08 | FRT08 | AI08 | G-SUBMIT; rerun changed gates only; report any unsatisfied mandatory requirement |

Estimates are active effort, not serial wall-clock promises. Use exact disjoint workers below to keep Ivan's infra/calculator load manageable. Model pulls run asynchronously while product work proceeds. If a gate misses time, cut SHOULD entirely, preserve official MUST and use remaining time for the failing critical path; never declare a failed live gate complete. Feature freeze at240 cannot waive missing runtime/case checks.

## Integration gates and exact producers

| Gate | Producer tasks / prerequisite | Pass evidence |
|---|---|---|
| G-CONTRACTS | B01/B02 | Shared Zod/types compile and schema tests pass; package names/error/status/nullability reviewed by all lanes |
| G-API | B03/B04 | Real PostgreSQL migrate/seed, H01/H02/H08 import/list/health; no model dependency |
| G-GPU-INFRA | B06 configured checkpoint | Brev instance running/reachable, host nvidia-smi, container GPU visible plus workload start or actual minimal CUDA operation; image/config alone insufficient |
| G-OPENAI | AI02+AI04+B05+B07+FRT03 | Actual UI click→H03→A01→OpenAI tool calls→T02→stored draft→UI; honest GPU unavailable/skip allowed, no fabricated decision |
| G-GPU-READY | B06, AI03 readiness | Private G02 returns selected model and deployment verification record matches current instance/container/model; no public endpoint needed |
| G-GPU-EXEC | B06 executed checkpoint + AI03:executed | Real classification inference correlated with GPU compute; valid SpecialistReport/GpuEvidence; no CPU or mocked result |
| G-GPU-CONSUMED | AI05 with B05 | Received GPU report enters T02 and changes borderline event action/review/quantity versus same-scope no-specialist counterfactual |
| G-COMBINED | B12 waits B06+B08+AI05+FRT04 | Above gates converge: live UI→OpenAI→Brev GPU→calculation→DB→edit→approve→CSV; current-run GPU evidence; no unsupported claim |
| G-MUST | B09+FRT05+AI06+B14 | All F01–F07 and case numerical fixtures pass; documentation exists; full reproduction follows W3; C13 requires partner acceptance or remains an explicit unmet external requirement |
| G-RELIABLE | B10/B11+FRT07+AI07 | Negative/deadline/revision checks, no secret leak, clean Brev reproduction, stopped-GPU degraded/recovery, RU/EN flow |
| G-FREEZE | Clock240 + Ivan | Stop features; record red checks and P0/P1 fixes only. Not automatically a green quality gate |
| G-SUBMIT | FRT08+AI08+B15 | Final checklist with current commits, actual OpenAI/GPU evidence, Sentinel disposition, truthful README and push |

AI03 has two checkpoints: `configured` can unblock AI04/B07 while B06 downloads; `executed` waits real B06 service. **No circular dependency:** B06 raw GPU smoke/verification is independent of the app/AI client. B07 has no B06 dependency. AI05 uses actual backend tools without needing B07 HTTP; B12 alone performs the final combined HTTP/UI gate.

## Preplanned parallelism and serialization

| Wave | Concurrent safe work | Must serialize / main orchestrator |
|---|---|---|
| W0 | After B02, B03 DB worker (Sol Medium) alongside Ivan B06 deployment (Sol High), Beka FRT01/FRT02, Ali AI01. After AI01, AI02 OpenAI and AI03 GPU client workers (Sol Medium) have disjoint dirs | Ivan retains B01/B02 contract/root ownership; B03→B04 due data dependency. FRT01 broad web scope ends before FRT02. AI01 config/index ends before AI04. Downloads do not own repo locks |
| W1 | B05 calculation worker (Sol Medium) while Ivan observes B06 pull/smoke; AI02/OpenAI and AI03/GPU client disjoint; frontend render/client progress with honest unavailable data | Ivan B07 then B08 serialize routes.ts. Ali retains AI04 callback/deadline integration then AI05 live gate. Beka retains FRT03 live-switch decision; FRT04 worker after. Ivan retains B12. B13 README Luna High only after shared gate |
| W2 | B09 fixture/test worker (Luna High), FRT05 UI (Sol Medium), AI06 guards (Sol Medium); independent lane paths | B14 README Luna High after three results; no concurrent README writer; no B05 calculator edits while its scope is leased elsewhere |
| W3 | FRT06→FRT07, AI07 and backend preparations; B10 starts when error contracts verified | B10 backend repairs after B09; B11 root/infra after B10/AI07/FRT07, no concurrent B06/root changes. UI workbench/dictionaries serial within lane |
| W4 | FRT08 and AI08 evidence checks (Luna High) while Ivan reads audit/checklist | B15 final shared writes after lane checks. Any P0/P1 fix gets an exact owned scope lease and relevant recheck; no two workers touch same paths |

Lane orchestrators GPT-6 Sol High. Normal coding GPT-6 Sol Medium; bounded tests/fixtures/README/simple fixes GPT-6 Luna High. Hard conflict Sol High, then Astra High only after serious recorded failed attempt. Prefer one worker per lane plus parent; use a second only for listed disjoint scopes and available concurrency. If slots limited, keep other work local rather than waiting. No all-lane barrier on GPU download.

## Sentinel checkpoints — minimum useful set

1. **After G-COMBINED / B12:** INTEGRATION, inspect actual cross-lane schemas, provenance and material GPU effect. This catches the highest-risk convergence early.
2. **After G-MUST / B14:** JUDGE, inspect all official obligations/fixture evidence and outstanding C13 gap before polish. Do not repeat general security scan here.
3. **At freeze/final B15:** FULL, combine reliability/security/submission truthfulness on the final candidate. After a specific P0/P1 fix use DIFF only on changed scope and affected contracts; SECURITY only if a new secret/exposure issue warrants it. No audit after every task.

## Hourly meaningful increments

~60: shared schemas, seed/import/health and bilingual shell, Brev infra proof or explicit logged blocker. ~120: real OpenAI UI draft and independent GPU inference; combined gate may finish by135. ~180: supplier review/approval/export, six-SKU requirement fixtures and RU/EN. ~240: all MUST/reliability and reproducible Brev stack; freeze. ~300: current runtime evidence, final docs/audit and pushed submission. Commit verified increments as they occur; status must distinguish incomplete GPU integration.
