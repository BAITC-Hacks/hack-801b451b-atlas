# Atlas Replenishment

Atlas is a local, bilingual workbench for preparing and reviewing supplier replenishment orders for the Elektokomplekt case. The application imports a normalized dataset, calculates deterministic recommendations, records an OpenAI agent's real tool execution, and stores editable drafts for human review and approval. It can export an approved order as CSV. Supplier sending and live 1C integration are out of scope.

## Current status

The non-GPU workflow is implemented and has passed a production-built local UI end-to-end run against the API and PostgreSQL. Run `00ebdb0c-9f42-4232-955e-111b0c9ea974` used a real OpenAI GPT-4.1 call and real backend tools; OpenAI succeeded and the Brev GPU runtime truthfully failed as unavailable. The browser run displayed six order lines, edited a line, rejected a stale revision with HTTP 409, acknowledged warnings, approved revision 3, downloaded CSV, then reloaded the same approved revision from the database. This verifies the local degraded workflow; it is not proof of GPU inference.

The complete local checks recorded for this repository passed: frozen-lockfile install, recursive typecheck, recursive build, and package tests. The UI flow was exercised with `pnpm --filter @atlas/web e2e:local` using local Chrome. A clean API/web restart and rerun are recorded in the [non-GPU application verification](docs/review/application.md), which also lists package-level test counts and the remaining gates. Build and test commands are listed below.

## What the workflow does

The manager selects a dataset and warehouse, then runs the replenishment workflow. The backend persists an immutable dataset snapshot and uses an OpenAI Agents SDK agent to call scoped tools for demand inspection, event classification, and deterministic order calculation. The backend owns all quantities. The UI shows runtime and tool events, supplier-grouped recommendations, reasons, warnings, and GPU availability. The manager can edit quantities, acknowledge warnings, approve a current revision, and download the approved order as CSV. Approval is local and does not send an order to a supplier.

The web application calls the same-origin `/api/v1` API through its server proxy. Fastify, PostgreSQL/Drizzle, shared Zod contracts, and the AI runner are in `apps/api`, `packages/db`, `packages/contracts`, and `packages/ai` respectively. Root Docker Compose starts the database, API, and web application. The Brev GPU specialist is an optional private service defined by `infra/brev/compose.gpu.yaml`.

## Local setup

Prerequisites: Node.js 22.16.x, pnpm 11.15.1, Docker with Compose, and Google Chrome for the browser end-to-end command. A working OpenAI API key is required to generate a live agent draft. Keep the key server-side in `.env`; never put it in a `NEXT_PUBLIC_*` variable.

In PowerShell from the repository root:

```powershell
Copy-Item .env.example .env
```

Edit `.env`: set `POSTGRES_PASSWORD` to a non-empty random alphanumeric value, set `OPENAI_API_KEY`, and set `OPENAI_MODEL=gpt-4.1-2025-04-14` for the model snapshot used in the recorded run. Other example values can remain as-is for the local degraded run. Do not commit `.env`.

Install dependencies and start the services:

```powershell
pnpm install --frozen-lockfile
docker compose up --build -d
docker compose exec -T api pnpm --filter @atlas/db migrate
docker compose exec -T api pnpm --filter @atlas/db seed
```

Open [http://localhost:3000](http://localhost:3000). The seed command is idempotent and creates a synthetic 24-month, six-SKU dataset. Use the workbench to select the dataset and warehouse and calculate a draft. To stop the local stack, run `docker compose down`; add `-v` only if you also intend to delete the local PostgreSQL data volume.

To exercise the production-built browser workflow from Chrome, with the services running and an OpenAI key configured:

```powershell
$env:ATLAS_BASE_URL = 'http://localhost:3000'
pnpm --filter @atlas/web e2e:local
```

The script launches the locally installed Chrome browser in headless mode. If Chrome is installed in a non-standard location, set `ATLAS_CHROME_PATH` to its executable path before running the command. The flow creates and edits a draft, checks stale-revision rejection and approval, downloads CSV, and verifies persisted state after reload. It invokes the live OpenAI workflow and accepts the honest GPU-unavailable degraded state.

## Build and verification

From the repository root:

```powershell
pnpm install --frozen-lockfile
pnpm -r --if-present typecheck
pnpm -r --if-present build
```

The package test files can be run with the workspace `tsx` runner:

```powershell
pnpm --filter @atlas/contracts exec tsx --test test/contracts.test.ts
pnpm --filter @atlas/db exec tsx --test test/persistence.test.ts
pnpm --filter @atlas/ai exec tsx --test test/config.test.ts test/openai.test.ts test/gpu.test.ts test/run.test.ts
pnpm --filter @atlas/api exec tsx --test test/import.test.ts test/calculation.test.ts test/runs.test.ts test/orders.test.ts
pnpm --filter @atlas/web exec tsx --test test/transport.test.ts
```

The browser test requires the running Compose stack, seeded data, a valid OpenAI configuration, and local Chrome as described above.

## Runtime and deployment status

OpenAI GPT-4.1 is the primary agent/control plane and was exercised successfully in the recorded local end-to-end run. GPU inference is not yet available or verified. Two Brev UI deployment attempts returned provider timeouts, a later Nebius request failed on provider VPC quota, and a GCP L4 instance is running for the final GPU phase. The application therefore reports a failed Brev GPU runtime, uses deterministic provisional handling for candidate events, and requires the manager to acknowledge warnings before approval. It does not claim or simulate GPU success. Brev deployment details and the evidence requirements for a GPU run are in [infra/brev/deployment.md](infra/brev/deployment.md).

The private GPU adapter boundary remains in `packages/ai`; when an appropriately provisioned and verified Brev GPU service becomes available, it can be configured through the existing Compose overlay and `.env` settings. The Brev GPU gate and G-COMBINED remain open: no GPU inference, GPU evidence, or dual-runtime end-to-end gate has passed. See the [executed application gate and open-gate record](docs/review/application.md).

## Data and limitations

- The included seed is synthetic development/demo data, not Elektokomplekt operational data. Its six SKUs, sales, stock, stockouts, supplier details, and inbound quantities are generated for repeatable demonstrations.
- The partner has not supplied a V2 sample or confirmed an accounting/1C exchange schema. The app accepts its documented normalized JSON shape; compatibility with the partner's actual files is unverified. Customer values must be anonymized before import.
- Forecasting uses the documented `replenishment-v1` heuristic. It is explainable and deterministic, but is not calibrated against partner history and does not claim forecast accuracy.
- Identity is local single-operator demo identity, without production authentication or roles. Supplier messaging and automatic sending are not implemented.
- GPU functionality is currently unavailable as described above; the local OpenAI and deterministic degraded path remains usable.

See the [official case and checklist](docs/case.md), [product specification and calculation method](docs/product-spec.md), [HTTP contract](docs/api.md), [AI/tool contract](docs/ai-contract.md), and [Brev deployment record](infra/brev/deployment.md).

## Disclosures

- The generic planning baseline was adapted from `hackalem-v4/templates/AGENTS-TEMPLATE.md` and `hackalem-v4/MODEL-POLICY.md` in the user's downloaded hackathon pack. Those materials are planning inputs, not application functionality. The supplied official `CASE-INPUT.md` is preserved in [docs/case.md](docs/case.md). No external partner connection or partner dataset is represented here.
- Runtime agent use: OpenAI Agents SDK with the OpenAI GPT-4.1 model, called server-side through the configured OpenAI API. The Brev llama.cpp/Qwen configuration is deployment preparation only; it has not been deployed or run on a GPU.
- Application dependencies and their exact pinned versions are listed in the root and workspace `package.json` files and `pnpm-lock.yaml`. The application uses Next.js, React, Fastify, Zod, Drizzle ORM, PostgreSQL, and OpenAI libraries. Consult the corresponding upstream project and model licenses before redistributing those components.
- External technical references used while preparing the implementation include the [OpenAI Agents SDK documentation](https://developers.openai.com/api/docs/guides/agents/sdk), [Brev custom container documentation](https://docs.nvidia.com/brev/guides/development-tools/custom-containers), [llama.cpp Docker documentation](https://github.com/ggml-org/llama.cpp/blob/master/docs/docker.md), and the [Qwen fallback model card](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF). The Qwen model was not used to produce the recorded demo.
