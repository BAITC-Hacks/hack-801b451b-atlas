# FRT08 — Frozen frontend final smoke

## Goal

Frozen frontend final smoke. Wave 4; estimated active effort 15 minutes (download waits may overlap other work). Follow [execution conventions](../../execution-conventions.md); commands below are implementation targets, not already-existing commands.

## Owner

Beka — frontend lane. Delegation never changes single-writer ownership.

## Recommended model

GPT-6 Luna High. Lane orchestrator: GPT-6 Sol High. Difficult bug/architecture conflict: GPT-6 Sol High; only after a serious evidenced attempt, GPT-6 Astra High. Simple bounded workers and README/tests/fixtures/small fixes: GPT-6 Luna High; normal coding workers: GPT-6 Sol Medium. No default Astra coding.

## Exact write scope

- `apps/web/test/final-check.md`

## Forbidden paths

apps/api/**; packages/db/**; packages/ai/**; packages/contracts/**; infra/**; root manifests/lockfile/Compose/env; README.md; docs/**. Allowed paths are only the explicit scope above; the task document itself is read-only to the worker. Read-only imports/inspection of dependencies allowed. Dependencies are not write permission. No real credentials in tracked files.

## Dependencies

FRT07

A `:configured` dependency means interface/tests ready; `:executed` additionally requires real GPU evidence. A task with a later live check may develop against a truthful unavailable boundary first, but cannot claim complete early.

## Relevant contracts

Final checklist; H01–H07; RU/EN main flow

## Implementation requirements

No new features. Replay production-built UI against final Brev stack, both languages; actual run/edit/approve/export/reload and GPU degradation. Verify displayed classification/model evidence matches stored run, no test/mock build. Report only actual results, screenshots/check descriptions and exact P0/P1 defects to Beka; code fixes require a clearly assigned nonoverlapping owner scope then repeat affected check. Send final evidence to Ivan; do not write README.

## Acceptance criteria

Production UI is verified against current API revision, both locales and actual GPU run; errors/degradation honest. Unverified runtime remains explicitly red.

## Exact verification command/check

Run at repository root in the configured development environment unless the check says Brev. Script/file creation belongs to this task unless [execution conventions](../../execution-conventions.md) assigns its producer. Missing script is a failed/incomplete task, never a pass.

```text
pnpm --filter @atlas/web typecheck
pnpm --filter @atlas/web build
Manual: final-checklist frontend/RU/EN sections against http://localhost:3000 via Brev SSH tunnel.
```

## Integration impact

Feeds B15; read-only code verification, safe bounded worker.

## Safe to delegate to a subagent

Yes, with an exclusive scope lease and the model below. Parent reviews and owns integration.

## Ready-to-run worker prompt

Read AGENTS.md, MODEL-POLICY.md, docs/execution-conventions.md and docs/frontend/tasks/FRT08.md. Execute only FRT08 for Beka. Verify dependencies including configured/executed qualifiers. Use GPT-6 Luna High. Write only: apps/web/test/final-check.md. Do not change contracts, shared files or another worker's files outside this scope. Implement the packet requirements, run every listed check, and return changed files, commands/results, actual-versus-configured runtime evidence and blockers. No fabricated OpenAI/GPU results, no secrets, no unrelated refactors. Do not commit/push unless the lane orchestrator explicitly assigns it. Stop with a precise mismatch if scope or contract blocks you.
