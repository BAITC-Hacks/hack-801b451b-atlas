# FRT04 — Review edits approval export and runtime evidence

## Goal

Review edits approval export and runtime evidence. Wave 1; estimated active effort 30 minutes (download waits may overlap other work). Follow [execution conventions](../../execution-conventions.md); commands below are implementation targets, not already-existing commands.

## Owner

Beka — frontend lane. Delegation never changes single-writer ownership.

## Recommended model

GPT-6 Sol Medium. Lane orchestrator: GPT-6 Sol High. Difficult bug/architecture conflict: GPT-6 Sol High; only after a serious evidenced attempt, GPT-6 Astra High. Simple bounded workers and README/tests/fixtures/small fixes: GPT-6 Luna High; normal coding workers: GPT-6 Sol Medium. No default Astra coding.

## Exact write scope

- `apps/web/src/components/workbench/**`
- `apps/web/src/components/evidence/**`
- `apps/web/src/messages/ru.ts`
- `apps/web/src/messages/en.ts`
- `apps/web/test/review.test.ts`

## Forbidden paths

apps/api/**; packages/db/**; packages/ai/**; packages/contracts/**; infra/**; root manifests/lockfile/Compose/env; README.md; docs/**. Allowed paths are only the explicit scope above; the task document itself is read-only to the worker. Read-only imports/inspection of dependencies allowed. Dependencies are not write permission. No real credentials in tracked files.

## Dependencies

FRT03, B08, AI04

A `:configured` dependency means interface/tests ready; `:executed` additionally requires real GPU evidence. A task with a later live check may develop against a truthful unavailable boundary first, but cannot claim complete early.

## Relevant contracts

H05/H06/H07; Run lines and warnings; AiResult/GpuEvidence; C05/C06/C09/C11

## Implementation requirements

Add quantity edit + mandatory reason, original recommendation visible, save current expectedRevision, refetch409, disable edits after approval. Confirmation explicitly approves local draft; requires acknowledgment for any warning/AI attention. Download only approved current revision with locale, no supplier sending button. Surface supplier/code/unit/urgency and formula contributions; zero rows remain inspectable.
Evidence drawer shows actual OpenAI/tool sequence, specialist candidate label/confidence/codes/event action, GPU deployment/model verification summary and genuine failed/skipped state. Status derives Run.ai.runtimes, never hardcoded success or simulated progress steps. Does not require GPU success to render; combined live review is checked in B12 after GPU gate. Unit fixtures labeled tests.

## Acceptance criteria

Live edit/approve/download/reload works; stale revision and required acknowledgment clear in RU/EN. UI configured evidence renderer alone is not GPU proof; B12/AI05 must supply real result.

## Exact verification command/check

Run at repository root in the configured development environment unless the check says Brev. Script/file creation belongs to this task unless [execution conventions](../../execution-conventions.md) assigns its producer. Missing script is a failed/incomplete task, never a pass.

```text
pnpm --filter @atlas/web exec tsx --test test/review.test.ts
pnpm --filter @atlas/web typecheck
Manual: live draft→edit/reason→save→acknowledge→approve→export; stale second tab gives409/refetch.
```

## Integration impact

B12 convergence consumes this screen; serialize all dictionary/workbench edits after FRT03.

## Safe to delegate to a subagent

Yes, with an exclusive scope lease and the model below. Parent reviews and owns integration.

## Ready-to-run worker prompt

Read AGENTS.md, MODEL-POLICY.md, docs/execution-conventions.md and docs/frontend/tasks/FRT04.md. Execute only FRT04 for Beka. Verify dependencies including configured/executed qualifiers. Use GPT-6 Sol Medium. Write only: apps/web/src/components/workbench/**; apps/web/src/components/evidence/**; apps/web/src/messages/ru.ts; apps/web/src/messages/en.ts; apps/web/test/review.test.ts. Do not change contracts, shared files or another worker's files outside this scope. Implement the packet requirements, run every listed check, and return changed files, commands/results, actual-versus-configured runtime evidence and blockers. No fabricated OpenAI/GPU results, no secrets, no unrelated refactors. Do not commit/push unless the lane orchestrator explicitly assigns it. Stop with a precise mismatch if scope or contract blocks you.
