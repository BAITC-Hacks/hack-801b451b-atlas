# FRT05 — Full MUST rationale and bilingual scenario

## Goal

Full MUST rationale and bilingual scenario. Wave 2; estimated active effort 25 minutes (download waits may overlap other work). Follow [execution conventions](../../execution-conventions.md); commands below are implementation targets, not already-existing commands.

## Owner

Beka — frontend lane. Delegation never changes single-writer ownership.

## Recommended model

GPT-6 Sol Medium. Lane orchestrator: GPT-6 Sol High. Difficult bug/architecture conflict: GPT-6 Sol High; only after a serious evidenced attempt, GPT-6 Astra High. Simple bounded workers and README/tests/fixtures/small fixes: GPT-6 Luna High; normal coding workers: GPT-6 Sol Medium. No default Astra coding.

## Exact write scope

- `apps/web/src/components/workbench/**`
- `apps/web/src/components/evidence/**`
- `apps/web/src/messages/ru.ts`
- `apps/web/src/messages/en.ts`
- `apps/web/test/messages.test.ts`

## Forbidden paths

apps/api/**; packages/db/**; packages/ai/**; packages/contracts/**; infra/**; root manifests/lockfile/Compose/env; README.md; docs/**. Allowed paths are only the explicit scope above; the task document itself is read-only to the worker. Read-only imports/inspection of dependencies allowed. Dependencies are not write permission. No real credentials in tracked files.

## Dependencies

FRT04, B12

A `:configured` dependency means interface/tests ready; `:executed` additionally requires real GPU evidence. A task with a later live check may develop against a truthful unavailable boundary first, but cannot claim complete early.

## Relevant contracts

F01–F07 UI; C01–C09 evidence; all Metrics/WarningCode/RuntimeErrorCode values

## Implementation requirements

Complete all six-SKU scenario views and localized numeric explanations, stockout lost/raw comparison, season/trend/uplift contributions, stock/inbound dates contribution and event exclusions. Keep grouped table main; no charts, chat or decorative AI panels. Evidence text explains safe limitations without implying GPU certainty. Map every contract error/warning/runtime state including null/skip/no_candidates and unverified.
Verify matching dictionary keys and no important strings in components; use Intl dates/numbers. Test message functions outside React with Node/tsx. Full main flow in RU then EN; changing locale does not trigger inference or lose edits. Ask Ivan for any missing data contract, never derive invented values.

## Acceptance criteria

Every demo-critical label/state/rationale available in both languages; actual combined flow understandable without developer narration. GPU effect is visible in event action/quantity or review state.

## Exact verification command/check

Run at repository root in the configured development environment unless the check says Brev. Script/file creation belongs to this task unless [execution conventions](../../execution-conventions.md) assigns its producer. Missing script is a failed/incomplete task, never a pass.

```text
pnpm --filter @atlas/web exec tsx --test test/messages.test.ts
pnpm --filter @atlas/web build
Manual: replay six-SKU combined flow in RU and EN, inspect season/growth/stockout/outlier and export rationale.
```

## Integration impact

Closes bilingual/product UI G-MUST; no overlapping workers in shared dictionaries.

## Safe to delegate to a subagent

Yes, with an exclusive scope lease and the model below. Parent reviews and owns integration.

## Ready-to-run worker prompt

Read AGENTS.md, MODEL-POLICY.md, docs/execution-conventions.md and docs/frontend/tasks/FRT05.md. Execute only FRT05 for Beka. Verify dependencies including configured/executed qualifiers. Use GPT-6 Sol Medium. Write only: apps/web/src/components/workbench/**; apps/web/src/components/evidence/**; apps/web/src/messages/ru.ts; apps/web/src/messages/en.ts; apps/web/test/messages.test.ts. Do not change contracts, shared files or another worker's files outside this scope. Implement the packet requirements, run every listed check, and return changed files, commands/results, actual-versus-configured runtime evidence and blockers. No fabricated OpenAI/GPU results, no secrets, no unrelated refactors. Do not commit/push unless the lane orchestrator explicitly assigns it. Stop with a precise mismatch if scope or contract blocks you.
