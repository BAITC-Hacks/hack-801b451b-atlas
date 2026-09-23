# Ai waves

Time targets: W0 0–60; W1 60–135; W2 135–195; W3 195–240; W4 240–300 minutes. Start early tasks as soon as dependencies pass; wave labels are integration deadlines, not barriers preventing useful parallel work. B06 starts W0 and may finish its executed milestone in W1. AI03:configured must not be confused with AI03:executed.

## W0

- [AI01](tasks/AI01.md): AI package and runtime configuration boundary. Dependencies: B01, B02. Worker permitted in exact lease; GPT-6 Sol Medium.
## W1

- [AI02](tasks/AI02.md): Real OpenAI agent and bounded tool loop. Dependencies: AI01. Worker permitted in exact lease; GPT-6 Sol Medium.
- [AI03](tasks/AI03.md): Typed Brev GPU client and independent live inference. Dependencies: AI01. Worker permitted in exact lease; GPT-6 Sol Medium.
- [AI04](tasks/AI04.md): Run controller and backend callback bridge. Dependencies: AI02, AI03:configured. Parent retains gate/decision; GPT-6 Sol High.
- [AI05](tasks/AI05.md): Application GPU result integration and causal evidence. Dependencies: AI04, AI03:executed, B05, B06. Parent retains gate/decision; GPT-6 Sol High.
## W2

- [AI06](tasks/AI06.md): Runtime guardrails and full MUST error behavior. Dependencies: AI05. Worker permitted in exact lease; GPT-6 Sol Medium.
## W3

- [AI07](tasks/AI07.md): Runtime smoke reproducibility and redaction audit. Dependencies: AI06. Worker permitted in exact lease; GPT-6 Luna High.
## W4

- [AI08](tasks/AI08.md): Frozen real-runtime final verification. Dependencies: AI07. Worker permitted in exact lease; GPT-6 Luna High.

## Scheduling rules

Keep AI04 control/fallback integration and AI05 live GPU causal gate with Ali. After AI01, AI02 OpenAI and AI03 GPU client can run concurrently because their dirs/scripts/tests do not overlap. AI06 later touches both, so wait for both leases to end.

Use the global [parallelism table](../waves.md#preplanned-parallelism-and-serialization) to coordinate across lanes. Within this lane, a later task overlapping any earlier file waits for that worker's completed handoff; do not infer permission from different task IDs. Parent is GPT-6 Sol High, code worker Sol Medium, bounded tests/docs worker Luna High; hard issues Sol High then evidenced Astra escalation. Shared README/root/infra operations stay Ivan-only. No audit after every task: Sentinel INTEGRATION at B12, JUDGE at B14, FULL at freeze/final B15; DIFF only for follow-up repairs.

The early G-OPENAI gate may show actual GPU unavailable while its image downloads. W1 cannot close before G-GPU-EXEC, G-GPU-CONSUMED and G-COMBINED. Complete user-visible flow includes local approval/export. No GPU result equals no GPU proof; retain actual failure state. C13 accounting compatibility requires actual partner confirmation, otherwise report it explicitly without blocking unrelated coding.
