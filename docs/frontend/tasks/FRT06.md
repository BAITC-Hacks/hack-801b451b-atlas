# FRT06 — Failure and stale-state UX

## Goal

Failure and stale-state UX. Wave 3; estimated active effort 20 minutes (download waits may overlap other work). Follow [execution conventions](../../execution-conventions.md); commands below are implementation targets, not already-existing commands.

## Owner

Beka — frontend lane. Delegation never changes single-writer ownership.

## Recommended model

GPT-6 Sol Medium. Lane orchestrator: GPT-6 Sol High. Difficult bug/architecture conflict: GPT-6 Sol High; only after a serious evidenced attempt, GPT-6 Astra High. Simple bounded workers and README/tests/fixtures/small fixes: GPT-6 Luna High; normal coding workers: GPT-6 Sol Medium. No default Astra coding.

## Exact write scope

- `apps/web/src/components/workbench/**`
- `apps/web/src/components/evidence/**`
- `apps/web/src/lib/api.ts`
- `apps/web/src/messages/ru.ts`
- `apps/web/src/messages/en.ts`
- `apps/web/test/failure-ui.test.ts`

## Forbidden paths

apps/api/**; packages/db/**; packages/ai/**; packages/contracts/**; infra/**; root manifests/lockfile/Compose/env; README.md; docs/**. Allowed paths are only the explicit scope above; the task document itself is read-only to the worker. Read-only imports/inspection of dependencies allowed. Dependencies are not write permission. No real credentials in tracked files.

## Dependencies

FRT05, AI06

A `:configured` dependency means interface/tests ready; `:executed` additionally requires real GPU evidence. A task with a later live check may develop against a truthful unavailable boundary first, but cannot claim complete early.

## Relevant contracts

H03–H07 errors; GPU_WORKLOAD_UNAVAILABLE; OpenAI/GPU deadlines

## Implementation requirements

Test invalid imports/empty selection/no recommendations, OpenAI timeout/auth failure, GPU unavailable/not-ready/timeout/malformed/unverified and lost request response. Degraded201 is a warning-bearing draft, not success banner for GPU. Show retry as user-driven new run, not automatic duplicate execution; preserve visible known run and approval revision. Refetch409 and do not overwrite other tab edits. All copy RU/EN. No simulated percentages while long inference runs.
Production client never exposes server env; test fault fixtures stay under tests. With live GPU stopped during B11, visibly show failed brev_gpu/null evidence and require acknowledgment. Check keyboard focus/disabled controls on loading/error.

## Acceptance criteria

Each fault has useful honest UI in both locales, no stale badge claiming current GPU success. Unit fault rendering configured only; live stopped-service evidence separately captured.

## Exact verification command/check

Run at repository root in the configured development environment unless the check says Brev. Script/file creation belongs to this task unless [execution conventions](../../execution-conventions.md) assigns its producer. Missing script is a failed/incomplete task, never a pass.

```text
pnpm --filter @atlas/web exec tsx --test test/failure-ui.test.ts
pnpm --filter @atlas/web typecheck
Manual: use B11 stopped-service drill; calculate, inspect warning, attempt approval without acknowledgment, restore service.
```

## Integration impact

Pairs with B10/AI06; production wire contract unchanged.

## Safe to delegate to a subagent

Yes, with an exclusive scope lease and the model below. Parent reviews and owns integration.

## Ready-to-run worker prompt

Read AGENTS.md, MODEL-POLICY.md, docs/execution-conventions.md and docs/frontend/tasks/FRT06.md. Execute only FRT06 for Beka. Verify dependencies including configured/executed qualifiers. Use GPT-6 Sol Medium. Write only: apps/web/src/components/workbench/**; apps/web/src/components/evidence/**; apps/web/src/lib/api.ts; apps/web/src/messages/ru.ts; apps/web/src/messages/en.ts; apps/web/test/failure-ui.test.ts. Do not change contracts, shared files or another worker's files outside this scope. Implement the packet requirements, run every listed check, and return changed files, commands/results, actual-versus-configured runtime evidence and blockers. No fabricated OpenAI/GPU results, no secrets, no unrelated refactors. Do not commit/push unless the lane orchestrator explicitly assigns it. Stop with a precise mismatch if scope or contract blocks you.
