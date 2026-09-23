# FRT01 — Operational shell and bilingual foundation

## Goal

Operational shell and bilingual foundation. Wave 0; estimated active effort 20 minutes (download waits may overlap other work). Follow [execution conventions](../../execution-conventions.md); commands below are implementation targets, not already-existing commands.

## Owner

Beka — frontend lane. Delegation never changes single-writer ownership.

## Recommended model

GPT-6 Sol Medium. Lane orchestrator: GPT-6 Sol High. Difficult bug/architecture conflict: GPT-6 Sol High; only after a serious evidenced attempt, GPT-6 Astra High. Simple bounded workers and README/tests/fixtures/small fixes: GPT-6 Luna High; normal coding workers: GPT-6 Sol Medium. No default Astra coding.

## Exact write scope

- `apps/web/**`

## Forbidden paths

apps/api/**; packages/db/**; packages/ai/**; packages/contracts/**; infra/**; root manifests/lockfile/Compose/env; README.md; docs/**. Allowed paths are only the explicit scope above; the task document itself is read-only to the worker. Read-only imports/inspection of dependencies allowed. Dependencies are not write permission. No real credentials in tracked files.

## Dependencies

B01

A `:configured` dependency means interface/tests ready; `:executed` additionally requires real GPU evidence. A task with a later live check may develop against a truthful unavailable boundary first, but cannot claim complete early.

## Relevant contracts

F06; docs/api Locale; logistics design guidance summarized in plan.md

## Implementation requirements

Bootstrap @atlas/web Next.js/TypeScript/Tailwind/shadcn/ui/Lucide. Package build/typecheck/dev/start scripts; request dependency/lockfile update from Ivan, do not install into shared lockfile yourself. One desktop-first replenishment workbench, not chat/marketing dashboard. Neutral surfaces, compact table-ready grid, clear typography and restrained status colors.
Create ru.ts/en.ts matching common/dataset/run/orders/approval/evidence/errors/warnings keys; visible RU/EN toggle, RU default, local persistence. All labels, loading/error/empty/success and GPU unavailable/timeout/unverified copy via dictionaries; no component literals. Localized source names remain data. Preserve server/client boundary; no OpenAI/GPU/registry secret imports. Add test-only transport interface with explicit UI preview label; do not import mocks into production routes.

## Acceptance criteria

UI starts with bilingual empty shell and keyboard-accessible locale switch. Layout fits Russian labels and1280px; no success inference claim or fake KPI card.

## Exact verification command/check

Run at repository root in the configured development environment unless the check says Brev. Script/file creation belongs to this task unless [execution conventions](../../execution-conventions.md) assigns its producer. Missing script is a failed/incomplete task, never a pass.

```text
pnpm --filter @atlas/web typecheck
pnpm --filter @atlas/web build
Manual: run pnpm --filter @atlas/web dev, open http://localhost:3000, switch RU→EN→reload.
```

## Integration impact

Foundation; broad scope ends here. Later packets split lib/evidence/workbench dirs for safe parallelism.

## Safe to delegate to a subagent

Yes, with an exclusive scope lease and the model below. Parent reviews and owns integration.

## Ready-to-run worker prompt

Read AGENTS.md, MODEL-POLICY.md, docs/execution-conventions.md and docs/frontend/tasks/FRT01.md. Execute only FRT01 for Beka. Verify dependencies including configured/executed qualifiers. Use GPT-6 Sol Medium. Write only: apps/web/**. Do not change contracts, shared files or another worker's files outside this scope. Implement the packet requirements, run every listed check, and return changed files, commands/results, actual-versus-configured runtime evidence and blockers. No fabricated OpenAI/GPU results, no secrets, no unrelated refactors. Do not commit/push unless the lane orchestrator explicitly assigns it. Stop with a precise mismatch if scope or contract blocks you.
