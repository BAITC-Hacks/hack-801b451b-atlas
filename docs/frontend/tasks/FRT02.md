# FRT02 — Typed transport and development fixtures

## Goal

Typed transport and development fixtures. Wave 0; estimated active effort 15 minutes (download waits may overlap other work). Follow [execution conventions](../../execution-conventions.md); commands below are implementation targets, not already-existing commands.

## Owner

Beka — frontend lane. Delegation never changes single-writer ownership.

## Recommended model

GPT-6 Sol Medium. Lane orchestrator: GPT-6 Sol High. Difficult bug/architecture conflict: GPT-6 Sol High; only after a serious evidenced attempt, GPT-6 Astra High. Simple bounded workers and README/tests/fixtures/small fixes: GPT-6 Luna High; normal coding workers: GPT-6 Sol Medium. No default Astra coding.

## Exact write scope

- `apps/web/src/lib/api.ts`
- `apps/web/src/lib/transport.ts`
- `apps/web/test/fixtures/**`
- `apps/web/test/transport.test.ts`
- `apps/web/next.config.ts`

## Forbidden paths

apps/api/**; packages/db/**; packages/ai/**; packages/contracts/**; infra/**; root manifests/lockfile/Compose/env; README.md; docs/**. Allowed paths are only the explicit scope above; the task document itself is read-only to the worker. Read-only imports/inspection of dependencies allowed. Dependencies are not write permission. No real credentials in tracked files.

## Dependencies

FRT01, B02

A `:configured` dependency means interface/tests ready; `:executed` additionally requires real GPU evidence. A task with a later live check may develop against a truthful unavailable boundary first, but cannot claim complete early.

## Relevant contracts

H01–H08 exact HTTP contracts, Error, Run.ai.runtimes, locale/revision export query

## Implementation requirements

Implement same-origin /api/v1 typed client using shared schemas; runtime parse responses/errors,110s run timeout, safe cancellation/loading and no duplicate submit while pending. Next server proxy uses API_INTERNAL_URL and preserves Origin for backend validation; route forwarding must not prefix /api twice. Implement datasets list/import, create/get run, patch lines, approve and export binary CSV APIs. Expose a small transport injection for component/unit tests only. Seed-shaped fixture JSON comes from shared schemas, clearly synthetic and test-only; GPU success fixture labeled stub and never routed into live UI.
No frontend network request goes directly to OpenAI or GPU service. Distinguish403/409/422/503/504 and degraded201. Download filename/locale/revision match H07. Do not invent /status polling or provider endpoints.

## Acceptance criteria

Contract tests validate every request method/path/body and response nullability. Mock mode cannot build into normal live path; configured mocks are not actual OpenAI/GPU proof.

## Exact verification command/check

Run at repository root in the configured development environment unless the check says Brev. Script/file creation belongs to this task unless [execution conventions](../../execution-conventions.md) assigns its producer. Missing script is a failed/incomplete task, never a pass.

```text
pnpm --filter @atlas/web exec tsx --test test/transport.test.ts
pnpm --filter @atlas/web typecheck
```

## Integration impact

FRT03 switches to live with no component schema rewrites; retain scopes disjoint from evidence worker.

## Safe to delegate to a subagent

Yes, with an exclusive scope lease and the model below. Parent reviews and owns integration.

## Ready-to-run worker prompt

Read AGENTS.md, MODEL-POLICY.md, docs/execution-conventions.md and docs/frontend/tasks/FRT02.md. Execute only FRT02 for Beka. Verify dependencies including configured/executed qualifiers. Use GPT-6 Sol Medium. Write only: apps/web/src/lib/api.ts; apps/web/src/lib/transport.ts; apps/web/test/fixtures/**; apps/web/test/transport.test.ts; apps/web/next.config.ts. Do not change contracts, shared files or another worker's files outside this scope. Implement the packet requirements, run every listed check, and return changed files, commands/results, actual-versus-configured runtime evidence and blockers. No fabricated OpenAI/GPU results, no secrets, no unrelated refactors. Do not commit/push unless the lane orchestrator explicitly assigns it. Stop with a precise mismatch if scope or contract blocks you.
