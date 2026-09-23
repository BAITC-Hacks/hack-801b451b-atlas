# FRT07 — Operational visual QA and client-secret audit

## Goal

Operational visual QA and client-secret audit. Wave 3; estimated active effort 20 minutes (download waits may overlap other work). Follow [execution conventions](../../execution-conventions.md); commands below are implementation targets, not already-existing commands.

## Owner

Beka — frontend lane. Delegation never changes single-writer ownership.

## Recommended model

GPT-6 Luna High. Lane orchestrator: GPT-6 Sol High. Difficult bug/architecture conflict: GPT-6 Sol High; only after a serious evidenced attempt, GPT-6 Astra High. Simple bounded workers and README/tests/fixtures/small fixes: GPT-6 Luna High; normal coding workers: GPT-6 Sol Medium. No default Astra coding.

## Exact write scope

- `apps/web/src/app/globals.css`
- `apps/web/src/components/workbench/**`
- `apps/web/src/components/evidence/**`
- `apps/web/test/visual-check.md`

## Forbidden paths

apps/api/**; packages/db/**; packages/ai/**; packages/contracts/**; infra/**; root manifests/lockfile/Compose/env; README.md; docs/**. Allowed paths are only the explicit scope above; the task document itself is read-only to the worker. Read-only imports/inspection of dependencies allowed. Dependencies are not write permission. No real credentials in tracked files.

## Dependencies

FRT06

A `:configured` dependency means interface/tests ready; `:executed` additionally requires real GPU evidence. A task with a later live check may develop against a truthful unavailable boundary first, but cannot claim complete early.

## Relevant contracts

F06/F07; logistics design baseline; no frontend secrets

## Implementation requirements

Check1280 desktop and narrow viewport: table scroll, long RU labels, quantity columns, supplier headers, evidence drawer, focus/contrast. Only small layout fixes; no new features/dependencies. Verify screenshot/visual checklist for empty/loading/error/degraded/approved in RU/EN. Inspect browser network/static build for secrets and absence of direct GPU/OpenAI calls. Record findings in lane-owned test/visual-check.md and hand evidence to Ivan for README; do not edit shared docs.

## Acceptance criteria

Legible operational table and accessible approval; no decorative generic AI dashboard, clipped Russian text or credentials in client bundle.

## Exact verification command/check

Run at repository root in the configured development environment unless the check says Brev. Script/file creation belongs to this task unless [execution conventions](../../execution-conventions.md) assigns its producer. Missing script is a failed/incomplete task, never a pass.

```text
pnpm --filter @atlas/web build
rg -n "OPENAI_API_KEY|NGC_API_KEY|GPU_VERIFICATION_PATH" apps/web/src
Manual: any matches must be removed or justified server-only; inspect .next/static for actual secret leakage without printing secret values; perform visual checklist.
```

## Integration impact

Unblocks B11 reproduction; scope serialized after FRT06.

## Safe to delegate to a subagent

Yes, with an exclusive scope lease and the model below. Parent reviews and owns integration.

## Ready-to-run worker prompt

Read AGENTS.md, MODEL-POLICY.md, docs/execution-conventions.md and docs/frontend/tasks/FRT07.md. Execute only FRT07 for Beka. Verify dependencies including configured/executed qualifiers. Use GPT-6 Luna High. Write only: apps/web/src/app/globals.css; apps/web/src/components/workbench/**; apps/web/src/components/evidence/**; apps/web/test/visual-check.md. Do not change contracts, shared files or another worker's files outside this scope. Implement the packet requirements, run every listed check, and return changed files, commands/results, actual-versus-configured runtime evidence and blockers. No fabricated OpenAI/GPU results, no secrets, no unrelated refactors. Do not commit/push unless the lane orchestrator explicitly assigns it. Stop with a precise mismatch if scope or contract blocks you.
