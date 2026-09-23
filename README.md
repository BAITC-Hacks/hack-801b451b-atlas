# Atlas Replenishment

Atlas is a local, bilingual workbench for preparing and reviewing supplier replenishment orders for the Elektokomplekt case. The application imports a normalized dataset, calculates deterministic recommendations, records an OpenAI agent's real tool execution, and stores editable drafts for human review and approval. It can export an approved order as CSV. Supplier sending and live 1C integration are out of scope.

## Current status

The complete workflow has passed a production-built browser end-to-end run against PostgreSQL and a live Brev NVIDIA L4 GPU. Run `a162030e-9c3b-459c-b106-632881838e4d` used OpenAI GPT-4.1, real backend tools, and same-run Qwen GPU inference; the verified GPU specialist materially changed the event decisions and excluded-unit total. The browser edited a six-line draft, rejected a stale revision with HTTP 409, acknowledged warnings when required, approved revision 3, downloaded CSV, and reloaded the same approved revision from the database. See the [combined GPU verification record](docs/review/combined.md) and [historical local degraded-mode record](docs/review/application.md).

Frozen-lockfile install, recursive typecheck/build and package tests passed; the combined GPU browser flow also passed with the API, web, database and specialist in the Brev Compose deployment. The local degraded-mode checks and package-level counts are recorded in the [historical application verification](docs/review/application.md); the live combined gate and reproduction details are in the [combined GPU verification](docs/review/combined.md).

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

OpenAI GPT-4.1 is the primary agent/control plane. Brev GPU inference has been verified on the running GCP L4 for the recorded combined run. The deployment history, current instance/runtime details, evidence requirements and stop-billing reminder are in [infra/brev/deployment.md](infra/brev/deployment.md).

The private GPU adapter boundary remains in `packages/ai`, configured through the existing Compose overlay and server-side `.env` settings. The recorded same-run proof covers GPU inference, correlated compute evidence, material event-decision impact, UI review, approval and export. Evidence is tied to the running deployment and must be regenerated after a runtime restart or change. The supplied partner/1C sample remains unverified.

## Data and limitations

- The included seed is synthetic development/demo data, not Elektokomplekt operational data. Its six SKUs, sales, stock, stockouts, supplier details, and inbound quantities are generated for repeatable demonstrations.
- The partner has not supplied a V2 sample or confirmed an accounting/1C exchange schema. The app accepts its documented normalized JSON shape; compatibility with the partner's actual files is unverified. Customer values must be anonymized before import.
- Forecasting uses the documented `replenishment-v1` heuristic. It is explainable and deterministic, but is not calibrated against partner history and does not claim forecast accuracy.
- Identity is local single-operator demo identity, without production authentication or roles. Supplier messaging and automatic sending are not implemented.
- The tested live run used a Brev GCP NVIDIA L4 GPU as described above. If GPU verification is unavailable or expires, the application retains its truthful degraded path; it does not represent CPU output as GPU inference.

See the [official case and checklist](docs/case.md), [product specification and calculation method](docs/product-spec.md), [HTTP contract](docs/api.md), [AI/tool contract](docs/ai-contract.md), and [Brev deployment record](infra/brev/deployment.md).

## Disclosures

- The generic planning baseline was adapted from `hackalem-v4/templates/AGENTS-TEMPLATE.md` and `hackalem-v4/MODEL-POLICY.md` in the user's downloaded hackathon pack. Those materials are planning inputs, not application functionality. The supplied official `CASE-INPUT.md` is preserved in [docs/case.md](docs/case.md). No external partner connection or partner dataset is represented here.
- Runtime agent use: OpenAI Agents SDK with OpenAI model snapshot `gpt-4.1-2025-04-14`, called server-side through the configured API. The verified Brev specialist uses the pinned llama.cpp CUDA image and Qwen2.5-1.5B-Instruct-GGUF model recorded in the deployment evidence. The model identity and actual GPU run are documented in the combined verification record.
- Application dependencies and their exact pinned versions are listed in the root and workspace `package.json` files and `pnpm-lock.yaml`. The application uses Next.js, React, Fastify, Zod, Drizzle ORM, PostgreSQL, and OpenAI libraries. Consult the corresponding upstream project and model licenses before redistributing those components.
- External technical references used while preparing the implementation include the [OpenAI Agents SDK documentation](https://developers.openai.com/api/docs/guides/agents/sdk), [Brev custom container documentation](https://docs.nvidia.com/brev/guides/development-tools/custom-containers), [llama.cpp Docker documentation](https://github.com/ggml-org/llama.cpp/blob/master/docs/docker.md), and the [Qwen model card](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF).
