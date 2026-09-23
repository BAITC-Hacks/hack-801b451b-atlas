# Beka — frontend execution plan

Execute 8 task packets against the frozen product/contracts; no lane redesign. [Global waves](../waves.md) · [Conventions](../execution-conventions.md) · [Orchestrator](orchestrator.md) · [Lane waves](waves.md).

## Ownership

apps/web/** only. Never write root manifests/lockfile, README, shared docs/contracts, API/DB/AI or infra. Give Ivan exact dependency requests and evidence.

## Task index

| Task | Wave | Deliverable | Dependencies | Recommended implementation model |
|---|---|---|---|---|
| [FRT01](tasks/FRT01.md) | W0 | Operational shell and bilingual foundation | B01 | GPT-6 Sol Medium |
| [FRT02](tasks/FRT02.md) | W0 | Typed transport and development fixtures | FRT01, B02 | GPT-6 Sol Medium |
| [FRT03](tasks/FRT03.md) | W1 | Live import select calculate and OpenAI result | FRT02, B07 | GPT-6 Sol High |
| [FRT04](tasks/FRT04.md) | W1 | Review edits approval export and runtime evidence | FRT03, B08, AI04 | GPT-6 Sol Medium |
| [FRT05](tasks/FRT05.md) | W2 | Full MUST rationale and bilingual scenario | FRT04, B12 | GPT-6 Sol Medium |
| [FRT06](tasks/FRT06.md) | W3 | Failure and stale-state UX | FRT05, AI06 | GPT-6 Sol Medium |
| [FRT07](tasks/FRT07.md) | W3 | Operational visual QA and client-secret audit | FRT06 | GPT-6 Luna High |
| [FRT08](tasks/FRT08.md) | W4 | Frozen frontend final smoke | FRT07 | GPT-6 Luna High |

## Parallelism and parent responsibility

Keep FRT03 mock-to-live switch and final cross-lane UX judgment with Beka. Worker may implement FRT02 or FRT04 only after earlier broad web leases end. All dictionaries/workbench writers serialize.

Lane orchestrator GPT-6 Sol High; normal coding/worker GPT-6 Sol Medium; simple bounded workers and README/tests/fixtures/small fixes GPT-6 Luna High. Difficult bug/architecture conflict Sol High; only after serious evidenced failure Astra High. Detailed allowed/forbidden paths and runnable worker prompt are in each delegable packet. Never run two workers with overlapping paths or let their implicit package installs race the lockfile.

## Operational layout and bilingual decisions

Adapt the downloaded design-logistics.md baseline: desktop-first purchasing workbench; neutral surfaces, compact typography, borders/dividers and restrained urgency colors. Header has dataset/source/asOf and locale switch, controls select warehouse/category, main supplier-grouped table shows SKU/name/units/recommended/final/urgency, evidence drawer shows numeric contributions and actual OpenAI/GPU events. Approval follows edit/reason and warning acknowledgment; export only after approval. No gradient hero, chat bubbles, decorative AI sparkles, fake KPI cards or charts before MUST.

RU initial locale and EN toggle; matching dictionaries for every demo label/state, source names stay data. No literal user-facing strings in components. Dense Russian text must fit; use horizontal table scroll on narrow viewport, visible focus and associated input labels. Only tests may inject mocks and must label them; production requests always same-origin API. A degraded201 draft is useful and displayed with a failed GPU badge, never disguised as successful GPU processing. FRT03 must not wait for B06.

## Completion

Return actual commands/results and evidence at every gate; configuration alone does not verify GPU integration. No task marked complete with skipped verification. Report blockers while continuing independent useful tasks; GPU/NGC/account access cannot be invented. SHOULD stays off until MUST and reliability are green. Freeze at240min; after that only owned P0/P1 fixes and final verification. README evidence is passed to Ivan continuously; B13/B14/B15 are the only planned README writers, serialized.
