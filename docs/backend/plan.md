# Ivan — backend execution plan

Execute 15 task packets against the frozen product/contracts; no lane redesign. [Global waves](../waves.md) · [Conventions](../execution-conventions.md) · [Orchestrator](orchestrator.md) · [Lane waves](waves.md).

## Ownership

apps/api/** and packages/db/**; Ivan is also the only shared/root writer and sole infra/brev/** deployment owner. Within these areas respect narrower concurrent task leases.

## Task index

| Task | Wave | Deliverable | Dependencies | Recommended implementation model |
|---|---|---|---|---|
| [B01](tasks/B01.md) | W0 | Root workspace and base Compose | None | GPT-6 Sol Medium |
| [B02](tasks/B02.md) | W0 | Publish shared strict contracts | B01 | GPT-6 Sol Medium |
| [B03](tasks/B03.md) | W0 | Persist datasets, drafts and audit with one seed | B02 | GPT-6 Sol Medium |
| [B04](tasks/B04.md) | W0 | Fastify health and normalized import | B03 | GPT-6 Sol Medium |
| [B05](tasks/B05.md) | W1 | Deterministic demand inspection and replenishment | B02, B03 | GPT-6 Sol Medium |
| [B06](tasks/B06.md) | W0 | Brev GPU deployment and actual specialist smoke | B01 | GPT-6 Sol High |
| [B07](tasks/B07.md) | W1 | Real API to AI bridge and OpenAI slice | B04, B05, AI02, AI04 | GPT-6 Sol High |
| [B08](tasks/B08.md) | W1 | Revision-safe edit approval and export | B07 | GPT-6 Sol Medium |
| [B09](tasks/B09.md) | W2 | Case fixtures and source sensitivity proof | B05, B08, B12 | GPT-6 Luna High |
| [B10](tasks/B10.md) | W3 | Failure security and deadline checks | B09, AI06, FRT06 | GPT-6 Sol High |
| [B11](tasks/B11.md) | W3 | Clean Brev Compose reproduction and failure drill | B10, AI07, FRT07 | GPT-6 Sol High |
| [B12](tasks/B12.md) | W1 | Combined OpenAI GPU user-flow gate | B06, B08, AI05, FRT04 | GPT-6 Sol High |
| [B13](tasks/B13.md) | W1 | README after first live milestone | B12 | GPT-6 Luna High |
| [B14](tasks/B14.md) | W2 | README and evidence after full MUST | B09, FRT05, AI06, B13 | GPT-6 Luna High |
| [B15](tasks/B15.md) | W4 | Freeze audit final README and submission | B11, B14, FRT08, AI08 | GPT-6 Luna High |

## Parallelism and parent responsibility

Keep B01/B02 shared decisions, B06 runtime/cost decisions, B07 callback bridge, B12 combined gate, B10/B11 reliability/reproduction and final integration with Ivan. Delegate B03/B05 and bounded tests/README in their exact scopes.

Lane orchestrator GPT-6 Sol High; normal coding/worker GPT-6 Sol Medium; simple bounded workers and README/tests/fixtures/small fixes GPT-6 Luna High. Difficult bug/architecture conflict Sol High; only after serious evidenced failure Astra High. Detailed allowed/forbidden paths and runnable worker prompt are in each delegable packet. Never run two workers with overlapping paths or let their implicit package installs race the lockfile.

## Core implementation boundary

Store immutable normalized inputs and audit drafts; deterministic tools own numerical output. H03 calls @atlas/ai, never a duplicated GPU adapter. B05 implements the frozen forecast, B09 proves all sources affect unsaturated examples. No real partner adapter or 1C-compatible claim without a supplied accepted mapping. GPU deployment has one explicit task B06 (W0 configured, W1 actually executed), location infra/brev/**. NIM feasibility<=10min, then small CUDA/Qwen alternative. API remains usable in truthful degraded mode during downloads. Shared package installation and lockfile updates are serialized; pull/merge only owned work.

## Completion

Return actual commands/results and evidence at every gate; configuration alone does not verify GPU integration. No task marked complete with skipped verification. Report blockers while continuing independent useful tasks; GPU/NGC/account access cannot be invented. SHOULD stays off until MUST and reliability are green. Freeze at240min; after that only owned P0/P1 fixes and final verification. README evidence is passed to Ivan continuously; B13/B14/B15 are the only planned README writers, serialized.
