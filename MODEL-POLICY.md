# Development model policy — PROMPT-1

This explicit user policy supersedes the older downloaded harness policy. It governs development, not runtime product inference.

| Work | Model / effort |
|---|---|
| Lane orchestrator | GPT-6 Sol High |
| Default coding / normal coding subagent | GPT-6 Sol Medium |
| Difficult bug / architecture conflict | GPT-6 Sol High |
| Unresolved after a serious evidenced Sol High attempt | GPT-6 Astra High |
| Simple bounded subagent | GPT-6 Luna High |
| README / tests / fixtures / small fixes | GPT-6 Luna High |

Astra is rare escalation, never default coding. Escalate one concrete task with a failing command, logs, minimal reproduction and relevant contract. Collect new evidence before changing model. A lane orchestrator keeps cross-lane decisions and integration gates; delegate only exact disjoint write scopes. If a named model is unavailable, report it and preserve intended capability/effort with the closest available model. No worker may silently broaden scope or edit another lane.
