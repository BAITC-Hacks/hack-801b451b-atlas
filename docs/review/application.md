# Historical local degraded-mode application gate — 2026-09-23

This records the earlier local product flow while the GPU runtime was unavailable. The later same-run OpenAI+Brev GPU verification closed the combined gate; see [combined verification](combined.md). This record remains useful as proof that the application preserves its honest degraded path.

## Environment and commands

- Node 22.16.0, pnpm 11.15.1, Docker Compose with PostgreSQL 16.9, API and Next.js web containers. API and DB stay private; web binds `127.0.0.1:3000`. A temporary local-only DB port overlay was used for host-side checks.
- `pnpm install --frozen-lockfile` — exit 0.
- `pnpm -r --if-present typecheck` — exit 0 for contracts, DB, AI, API and web.
- `pnpm -r --if-present build` — exit 0 for those five packages.
- Package tests: contracts 4/4, DB 1/1, AI 17/17, API 10/10, web transport 6/6 — all exit 0.
- `pnpm --filter @atlas/db migrate` — exit 0; both migrations already applied.
- `pnpm --filter @atlas/db seed` twice — both returned the same synthetic snapshot ID `b68cfeb8-586f-4600-9119-75665f377f06`.
- Compose API/web stopped and restarted against the existing DB; `GET http://localhost:3000/api/v1/health` returned `{"status":"ok","database":"ok"}`.
- `pnpm --filter @atlas/web e2e:local` after restart — exit 0, run `30565816-21f4-4ac0-8607-7ab572a4293a`.
- A further production web rebuild after selecting the stable seed by default and clarifying the approved degraded status passed `pnpm --filter @atlas/web e2e:local` — exit 0, run `9b054028-748c-425e-9857-01213897dd8e` with six lines, OpenAI success, truthful Brev failure, approved revision 3, stale HTTP 409 and 1,508-byte CSV.
- After the API bind and CSV escaping fixes, a rebuilt API container passed `pnpm --filter @atlas/web e2e:local` — exit 0, run `5475a279-93de-4497-a833-078bb9429291`; the test also asserted the stable seed was selected by default. OpenAI succeeded, the missing GPU remained failed, revision 3 persisted, the stale edit returned 409, and EN CSV contained 1,511 bytes.

## Observed workflow

The production Next.js page loaded the synthetic dataset through its same-origin proxy. A RU user selected `WH_DEMO` and calculated a six-line draft. The run called OpenAI model `gpt-4.1-2025-04-14` through the Agents SDK and recorded successful `inspectDemand`, `classifyEvents` and `calculateOrders` tool events. The backend persisted the draft. Brev was unavailable, so the run was **degraded**, with failed `brev_gpu`, null specialist and GPU evidence, and a review warning.

The page edited one final quantity while retaining the recommendation, creating revision 2. A request using expected revision 1 returned HTTP 409 `REVISION_CONFLICT`. The page acknowledged the warnings, confirmed the current revision and approved revision 3. Switching RU→EN did not start another AI run. The EN CSV download had a UTF-8 BOM, approved quantity and localized explanation; its size was 1,508 bytes. Reloading the page and refetching H04 both showed approved revision 3. No supplier order was sent.

The original frontend had a browser-only `fetch` binding defect: the page sent no dataset request even though a direct web-proxy health check returned 200. `Transport` now invokes `globalThis.fetch` with the correct receiver. The same local browser test then loaded the dataset and passed the complete flow.

## State at the time of this run

- At the time of this local-only run, no Brev GPU container or inference had executed. Later provisioning and combined-runtime evidence are recorded in [deployment record](../../infra/brev/deployment.md) and [combined verification](combined.md).
- The proposed CSV mapping has no accepted partner/1C sample. It must not be described as verified 1C compatibility.
