# Beka — shortage priority and CSV preflight

Implement these two features now in the Atlas repository. Work in parallel with Ali, who owns backend order pricing and budget checks. Read `AGENTS.md`, `docs/case.md`, the shared `Run` and `DatasetInput` contracts, and the current web workbench first. This prompt explicitly assigns you only `apps/web/**`. Do not edit API, AI, DB, contracts, docs, root files, manifests, or lockfile. Preserve the real API transport, existing run/edit/approval/export flow, and RU/EN localization.

## Features

3. **Shortage priority:** In the existing workbench, show a clear high/normal/none shortage priority for each run line, based only on persisted `line.urgency` and supporting metrics/warnings already returned by the real backend. Add a sort or filter that brings high-risk lines first without altering the run or calculated quantities. Explain the signal concisely in RU and EN. Keep stable ordering within equal priorities.
4. **CSV error and duplicate check:** Add a small CSV preflight UI next to the existing dataset import area. Validate a selected sales CSV before submission: required column names, missing values, malformed dates/numbers, duplicate sale IDs, and repeated data rows. Report row numbers and concise RU/EN error messages; block submission when errors exist. Parse quoted commas/newlines correctly; do not use a naive `split(',')`. Do not invent AI column mapping or claim that the existing JSON-only API imports arbitrary CSV. If full CSV-to-dataset submission cannot be built within `apps/web/**` and the current contract, label this honestly as a preflight check, retain the existing JSON import, and report the backend/contract work required to enable CSV persistence.

Add focused web tests for priority order, valid CSV, duplicate IDs, missing required values, and quoted fields. Run web build/typecheck and targeted tests. Do not add dependencies unless already available without a lockfile change. Avoid placeholder controls or fake API responses in the production path.

## Parallel Git workflow

Before editing, inspect `git status` and use your own checkout/worktree based on the latest `origin/main`. Create branch `codex/beka-priority-csv`. Never work on or push `main`, never force-push, and never stage Ali's files or credentials. Inspect `git diff --staged` for secrets; commit only `apps/web/**`, then push with `git push -u origin codex/beka-priority-csv`. Send the integrator the branch name, commit SHA, changed files, commands/results, and any limitation. Do not merge your branch yourself. The integrator merges both branches, runs the combined checks, and wires Ali's quote endpoint into the UI if needed.
