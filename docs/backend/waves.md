# Backend waves

Time targets: W0 0–60; W1 60–135; W2 135–195; W3 195–240; W4 240–300 minutes. Start early tasks as soon as dependencies pass; wave labels are integration deadlines, not barriers preventing useful parallel work. B06 starts W0 and may finish its executed milestone in W1. AI03:configured must not be confused with AI03:executed.

## W0

- [B01](tasks/B01.md): Root workspace and base Compose. Dependencies: none. Parent retains gate/decision; GPT-6 Sol Medium.
- [B02](tasks/B02.md): Publish shared strict contracts. Dependencies: B01. Parent retains gate/decision; GPT-6 Sol Medium.
- [B03](tasks/B03.md): Persist datasets, drafts and audit with one seed. Dependencies: B02. Worker permitted in exact lease; GPT-6 Sol Medium.
- [B04](tasks/B04.md): Fastify health and normalized import. Dependencies: B03. Worker permitted in exact lease; GPT-6 Sol Medium.
- [B06](tasks/B06.md): Brev GPU deployment and actual specialist smoke. Dependencies: B01. Parent retains gate/decision; GPT-6 Sol High.
## W1

- [B05](tasks/B05.md): Deterministic demand inspection and replenishment. Dependencies: B02, B03. Worker permitted in exact lease; GPT-6 Sol Medium.
- [B07](tasks/B07.md): Real API to AI bridge and OpenAI slice. Dependencies: B04, B05, AI02, AI04. Parent retains gate/decision; GPT-6 Sol High.
- [B08](tasks/B08.md): Revision-safe edit approval and export. Dependencies: B07. Worker permitted in exact lease; GPT-6 Sol Medium.
- [B12](tasks/B12.md): Combined OpenAI GPU user-flow gate. Dependencies: B06, B08, AI05, FRT04. Parent retains gate/decision; GPT-6 Sol High.
- [B13](tasks/B13.md): README after first live milestone. Dependencies: B12. Worker permitted in exact lease; GPT-6 Luna High.
## W2

- [B09](tasks/B09.md): Case fixtures and source sensitivity proof. Dependencies: B05, B08, B12. Worker permitted in exact lease; GPT-6 Luna High.
- [B14](tasks/B14.md): README and evidence after full MUST. Dependencies: B09, FRT05, AI06, B13. Worker permitted in exact lease; GPT-6 Luna High.
## W3

- [B10](tasks/B10.md): Failure security and deadline checks. Dependencies: B09, AI06, FRT06. Parent retains gate/decision; GPT-6 Sol High.
- [B11](tasks/B11.md): Clean Brev Compose reproduction and failure drill. Dependencies: B10, AI07, FRT07. Parent retains gate/decision; GPT-6 Sol High.
## W4

- [B15](tasks/B15.md): Freeze audit final README and submission. Dependencies: B11, B14, FRT08, AI08. Parent retains gate/decision; GPT-6 Luna High.

## Scheduling rules

Keep B01/B02 shared decisions, B06 runtime/cost decisions, B07 callback bridge, B12 combined gate, B10/B11 reliability/reproduction and final integration with Ivan. Delegate B03/B05 and bounded tests/README in their exact scopes.

Use the global [parallelism table](../waves.md#preplanned-parallelism-and-serialization) to coordinate across lanes. Within this lane, a later task overlapping any earlier file waits for that worker's completed handoff; do not infer permission from different task IDs. Parent is GPT-6 Sol High, code worker Sol Medium, bounded tests/docs worker Luna High; hard issues Sol High then evidenced Astra escalation. Shared README/root/infra operations stay Ivan-only. No audit after every task: Sentinel INTEGRATION at B12, JUDGE at B14, FULL at freeze/final B15; DIFF only for follow-up repairs.

The early G-OPENAI gate may show actual GPU unavailable while its image downloads. W1 cannot close before G-GPU-EXEC, G-GPU-CONSUMED and G-COMBINED. Complete user-visible flow includes local approval/export. No GPU result equals no GPU proof; retain actual failure state. C13 accounting compatibility requires actual partner confirmation, otherwise report it explicitly without blocking unrelated coding.
