# Ali — ai execution plan

Execute 8 task packets against the frozen product/contracts; no lane redesign. [Global waves](../waves.md) · [Conventions](../execution-conventions.md) · [Orchestrator](orchestrator.md) · [Lane waves](waves.md).

## Ownership

packages/ai/** only. Own the one application GPU HTTP client, OpenAI runner and runtime validation. Ivan alone writes infra/brev/**, deploys the GPU container and stores shared deployment evidence.

## Task index

| Task | Wave | Deliverable | Dependencies | Recommended implementation model |
|---|---|---|---|---|
| [AI01](tasks/AI01.md) | W0 | AI package and runtime configuration boundary | B01, B02 | GPT-6 Sol Medium |
| [AI02](tasks/AI02.md) | W1 | Real OpenAI agent and bounded tool loop | AI01 | GPT-6 Sol Medium |
| [AI03](tasks/AI03.md) | W1 | Typed Brev GPU client and independent live inference | AI01 | GPT-6 Sol Medium |
| [AI04](tasks/AI04.md) | W1 | Run controller and backend callback bridge | AI02, AI03:configured | GPT-6 Sol High |
| [AI05](tasks/AI05.md) | W1 | Application GPU result integration and causal evidence | AI04, AI03:executed, B05, B06 | GPT-6 Sol High |
| [AI06](tasks/AI06.md) | W2 | Runtime guardrails and full MUST error behavior | AI05 | GPT-6 Sol Medium |
| [AI07](tasks/AI07.md) | W3 | Runtime smoke reproducibility and redaction audit | AI06 | GPT-6 Luna High |
| [AI08](tasks/AI08.md) | W4 | Frozen real-runtime final verification | AI07 | GPT-6 Luna High |

## Parallelism and parent responsibility

Keep AI04 control/fallback integration and AI05 live GPU causal gate with Ali. After AI01, AI02 OpenAI and AI03 GPU client can run concurrently because their dirs/scripts/tests do not overlap. AI06 later touches both, so wait for both leases to end.

Lane orchestrator GPT-6 Sol High; normal coding/worker GPT-6 Sol Medium; simple bounded workers and README/tests/fixtures/small fixes GPT-6 Luna High. Difficult bug/architecture conflict Sol High; only after serious evidenced failure Astra High. Detailed allowed/forbidden paths and runnable worker prompt are in each delegable packet. Never run two workers with overlapping paths or let their implicit package installs race the lockfile.

## Runtime division

OpenAI agent observes safe deterministic tool summaries, invokes GPU classification and calculator, then returns a validated review disposition. GPU specialist receives numeric candidate features, not the OpenAI answer. Its real class/confidence/evidence affects guarded event exclusion/retention and review. T02 retains numerical authority. AI has no approval/send/DB tool. Both results have strict schemas and run-scoped evidence.

AI03 owns G01/G02 production HTTP once; B06 owns standalone operational smoke/deployment. Separate configured and actual-GPU checkpoints. Missing GPU/current record produces failed brev_gpu and null specialist/evidence; no host API credit/key or CPU substitution. AI02 real OpenAI smoke can run before GPU startup. AI05 proves material effect; a configured endpoint, model listing or nvidia-smi alone is insufficient.

## Completion

Return actual commands/results and evidence at every gate; configuration alone does not verify GPU integration. No task marked complete with skipped verification. Report blockers while continuing independent useful tasks; GPU/NGC/account access cannot be invented. SHOULD stays off until MUST and reliability are green. Freeze at240min; after that only owned P0/P1 fixes and final verification. README evidence is passed to Ivan continuously; B13/B14/B15 are the only planned README writers, serialized.
