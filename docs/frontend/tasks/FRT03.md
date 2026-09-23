# FRT03 — Live import select calculate and OpenAI result

## Goal

Live import select calculate and OpenAI result. Wave 1; estimated active effort 25 minutes (download waits may overlap other work). Follow [execution conventions](../../execution-conventions.md); commands below are implementation targets, not already-existing commands.

## Owner

Beka — frontend lane. Delegation never changes single-writer ownership.

## Recommended model

GPT-6 Sol High. Lane orchestrator: GPT-6 Sol High. Difficult bug/architecture conflict: GPT-6 Sol High; only after a serious evidenced attempt, GPT-6 Astra High. Simple bounded workers and README/tests/fixtures/small fixes: GPT-6 Luna High; normal coding workers: GPT-6 Sol Medium. No default Astra coding.

## Exact write scope

- `apps/web/src/app/page.tsx`
- `apps/web/src/components/workbench/**`
- `apps/web/src/messages/ru.ts`
- `apps/web/src/messages/en.ts`

## Forbidden paths

apps/api/**; packages/db/**; packages/ai/**; packages/contracts/**; infra/**; root manifests/lockfile/Compose/env; README.md; docs/**. Allowed paths are only the explicit scope above; the task document itself is read-only to the worker. Read-only imports/inspection of dependencies allowed. Dependencies are not write permission. No real credentials in tracked files.

## Dependencies

FRT02, B07

A `:configured` dependency means interface/tests ready; `:executed` additionally requires real GPU evidence. A task with a later live check may develop against a truthful unavailable boundary first, but cannot claim complete early.

## Relevant contracts

H01/H02/H03/H04; G-OPENAI; F01/F04/F06

## Implementation requirements

Wire actual client to seed dataset list, JSON import with privacy confirmation, warehouse and optional category selectors, Calculate and stored run reload by known ID. Display dataset source/synthetic label/asOf and supplier-grouped rows/zero rows, recommendation and simple numeric rationale. Persist known runId locally for GET refresh; do not invent listing/recovery endpoint. Error issue codes localize; empty data/no recommendations/loading/success all RU/EN.
Verify real UI action reaches real API and OpenAI tool loop. GPU may be genuinely unavailable or skipped; expose that state prominently while accepting usable deterministic draft. Never wait for B06 model download to exercise this path. This early gate does not claim completed GPU integration or approval/export.

## Acceptance criteria

G-OPENAI user half: live click returns persisted rows and actual openai runtime success; browser reload fetches same run. GPU configured/unavailable shown truthfully; no mock success.

## Exact verification command/check

Run at repository root in the configured development environment unless the check says Brev. Script/file creation belongs to this task unless [execution conventions](../../execution-conventions.md) assigns its producer. Missing script is a failed/incomplete task, never a pass.

```text
pnpm --filter @atlas/web typecheck
Manual: start real API+DB and web, import/select seed, select warehouse/category, Calculate; inspect POST /api/v1/runs and openai success; reload known run; switch both locales.
```

## Integration impact

Unblocks user-visible slice; no dependency on GPU readiness. FRT04 later uses real Brev result.

## Safe to delegate to a subagent

No for the integration/ownership decision. Keep with lane orchestrator; implementation fragments require a separately bounded disjoint lease.

## Orchestrator execution prompt

Read AGENTS.md, MODEL-POLICY.md, docs/execution-conventions.md and docs/frontend/tasks/FRT03.md. Execute only FRT03 for Beka. Verify dependencies including configured/executed qualifiers. Use GPT-6 Sol High. Write only: apps/web/src/app/page.tsx; apps/web/src/components/workbench/**; apps/web/src/messages/ru.ts; apps/web/src/messages/en.ts. Do not change contracts, shared files or another worker's files outside this scope. Implement the packet requirements, run every listed check, and return changed files, commands/results, actual-versus-configured runtime evidence and blockers. No fabricated OpenAI/GPU results, no secrets, no unrelated refactors. Do not commit/push unless the lane orchestrator explicitly assigns it. Stop with a precise mismatch if scope or contract blocks you. Keep the live gate/ownership decision with the lane orchestrator.
