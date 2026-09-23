# Frontend waves

Time targets: W0 0–60; W1 60–135; W2 135–195; W3 195–240; W4 240–300 minutes. Start early tasks as soon as dependencies pass; wave labels are integration deadlines, not barriers preventing useful parallel work. B06 starts W0 and may finish its executed milestone in W1. AI03:configured must not be confused with AI03:executed.

## W0

- [FRT01](tasks/FRT01.md): Operational shell and bilingual foundation. Dependencies: B01. Worker permitted in exact lease; GPT-6 Sol Medium.
- [FRT02](tasks/FRT02.md): Typed transport and development fixtures. Dependencies: FRT01, B02. Worker permitted in exact lease; GPT-6 Sol Medium.
## W1

- [FRT03](tasks/FRT03.md): Live import select calculate and OpenAI result. Dependencies: FRT02, B07. Parent retains gate/decision; GPT-6 Sol High.
- [FRT04](tasks/FRT04.md): Review edits approval export and runtime evidence. Dependencies: FRT03, B08, AI04. Worker permitted in exact lease; GPT-6 Sol Medium.
## W2

- [FRT05](tasks/FRT05.md): Full MUST rationale and bilingual scenario. Dependencies: FRT04, B12. Worker permitted in exact lease; GPT-6 Sol Medium.
## W3

- [FRT06](tasks/FRT06.md): Failure and stale-state UX. Dependencies: FRT05, AI06. Worker permitted in exact lease; GPT-6 Sol Medium.
- [FRT07](tasks/FRT07.md): Operational visual QA and client-secret audit. Dependencies: FRT06. Worker permitted in exact lease; GPT-6 Luna High.
## W4

- [FRT08](tasks/FRT08.md): Frozen frontend final smoke. Dependencies: FRT07. Worker permitted in exact lease; GPT-6 Luna High.

## Scheduling rules

Keep FRT03 mock-to-live switch and final cross-lane UX judgment with Beka. Worker may implement FRT02 or FRT04 only after earlier broad web leases end. All dictionaries/workbench writers serialize.

Use the global [parallelism table](../waves.md#preplanned-parallelism-and-serialization) to coordinate across lanes. Within this lane, a later task overlapping any earlier file waits for that worker's completed handoff; do not infer permission from different task IDs. Parent is GPT-6 Sol High, code worker Sol Medium, bounded tests/docs worker Luna High; hard issues Sol High then evidenced Astra escalation. Shared README/root/infra operations stay Ivan-only. No audit after every task: Sentinel INTEGRATION at B12, JUDGE at B14, FULL at freeze/final B15; DIFF only for follow-up repairs.

The early G-OPENAI gate may show actual GPU unavailable while its image downloads. W1 cannot close before G-GPU-EXEC, G-GPU-CONSUMED and G-COMBINED. Complete user-visible flow includes local approval/export. No GPU result equals no GPU proof; retain actual failure state. C13 accounting compatibility requires actual partner confirmation, otherwise report it explicitly without blocking unrelated coding.
