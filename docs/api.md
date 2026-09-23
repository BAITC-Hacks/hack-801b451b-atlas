# HTTP contract v1.1 — frozen implementation target

Owner/writer: **Ivan** (`packages/contracts/**`, `apps/api/**`); consumer: Beka. All shapes below become strict Zod objects and inferred TypeScript, not independently copied interfaces. This file specifies contracts only; no server exists yet. v1.1 applies the authoritative Brev resource correction: `runtimes`/`RuntimeStatus`, `brev_gpu`, `gpuEvidence` and `GPU_WORKLOAD_UNAVAILABLE` replace the previous hosted-provider assumption; all consumers must use the same revision. AI shares the types in this file. Base `/api/v1`; JSON except CSV. No undefined/null interchange: `?` means optional; explicit null is required when shown. Unknown fields rejected.

## Scalars and shared types

- `Id`: nonempty ASCII `[A-Za-z0-9_.:-]{1,80}`; generated entity IDs may be UUIDs; source SKU/supplier codes must be preserved. Imported SKU is additionally limited to 48 characters for composed evidence IDs; unsupported codes fail validation, never silently truncate.
- `Date`: valid `YYYY-MM-DD`, calendar dates; `Instant`: ISO UTC timestamp. `Qty`: integer 0..1,000,000,000. `Num`: finite nonnegative number. `Locale`: `ru | en`.
- `Error`: `{error:{code:ErrorCode,requestId:Id,issues?:{path:string,code:string}[]}}`. No raw input/runtime errors/secrets in responses.
- `ErrorCode`: `VALIDATION_ERROR | PAYLOAD_TOO_LARGE | DATA_GAP | CANDIDATE_LIMIT | NOT_FOUND | REVISION_CONFLICT | RUN_LOCKED | REVIEW_REQUIRED | CALCULATION_FAILED | DEADLINE_EXCEEDED | DB_UNAVAILABLE | FORBIDDEN | INTERNAL_ERROR`.
- `WarningCode`: `INSUFFICIENT_HISTORY | CAPPED_TREND | STALE_STOCK | OVERDUE_INBOUND | ANOMALY_REVIEW | OPENAI_FAILED | GPU_WORKLOAD_UNAVAILABLE | DATA_GAP | DEMAND_RISK`.
- `Warning`: `{code:WarningCode,sku:Id|null,evidenceIds:Id[]}`. Degraded OpenAI/GPU workload warnings apply to run (`sku:null`).
- `RuntimeErrorCode`: `TIMEOUT | RATE_LIMIT | AUTH | NETWORK | INVALID_OUTPUT | RUNTIME_ERROR | DEADLINE | GPU_UNAVAILABLE | GPU_UNVERIFIED`.
- `RuntimeStatus`: `{runtime:'openai'|'brev_gpu',status:'success'|'failed'|'skipped',model:string|null,attempts:integer,elapsedMs:integer,errorCode:RuntimeErrorCode|null,skipReason:'no_candidates'|'not_reached'|null}`. Attempts 0..7 for OpenAI, 0..2 for Brev GPU inference; readiness probes do not count as inference attempts. Success requires validated real output; `brev_gpu` additionally requires current GPU verification evidence. Zero attempts with GPU_UNAVAILABLE/GPU_UNVERIFIED is a legitimate failed preflight. GPU timeouts/unavailability map to warning GPU_WORKLOAD_UNAVAILABLE, never a fabricated specialist report.
- `Metrics`: `{baseDaily:Num,seasonFactor:Num,trendFactor:Num,plannedGrowthPct:Num,leadTimeDays:integer,reviewDays:integer,safetyDays:integer,horizonDays:integer,forecastDaily:Num,targetUnits:Num,stock:Qty,eligibleInbound:Qty,laterInbound:Qty,overdueInbound:Qty,lostDemandUnits:Num,excludedUnits:Qty,rawSalesQty:Qty}`. Lost/excluded units cover the full input history; rawSalesQty is the complete no-imputation counterfactual.
- `OrderLine`: `{sku:Id,name:string,unit:string,supplierId:Id,supplierName:string,recommendedQty:Qty,finalQty:Qty,overrideReason:string|null,urgency:'none'|'normal'|'high',metrics:Metrics,excludedEventIds:Id[],warnings:Warning[]}`. Recommended quantity immutable; final initially equal to it. Rationale rendered from metrics/codes in RU/EN. A model never supplies these numbers.
- `TraceEvent`: `{id:Id,kind:'tool'|'runtime'|'decision',name:'inspectDemand'|'classifyEvents'|'calculateOrders'|'openai'|'brev_gpu'|'reviewDecision',status:'success'|'failed'|'skipped',elapsedMs:integer,evidenceIds:Id[]}`. Execution facts only; no hidden reasoning/full prompts.
- `Run`: `{id:Id,datasetId:Id,datasetHash:string,warehouseId:Id,categoryId:Id|null,asOf:Date,algorithmVersion:'replenishment-v1',status:'draft'|'approved',mode:'live'|'degraded',revision:integer>=1,lines:OrderLine[],warnings:Warning[],ai:AiResult,approvedAt:Instant|null,approvedBy:string|null,createdAt:Instant}`. `AiResult` is defined in [ai-contract.md](ai-contract.md). `lines` ordered by supplierId then sku; UI groups by supplierId. Review required if any line/run warning or AI disposition needs_attention. Approval timestamp/operator set by server. Initial revision=1; Run.mode must equal Run.ai.mode. Warning arrays are deduplicated; numeric outputs must remain finite and within Qty bounds or calculation fails explicitly.

## Dataset boundary (H01/H02)

`DatasetInput`:

```text
{
  schemaVersion: '1', label: string(1..120), kind: 'synthetic'|'partner',
  currency: string(3), historyStart: Date, asOf: Date,
  privacyConfirmed: true,
  sources: {
    sales: string(1..120), stock: string(1..120), stockouts: string(1..120),
    suppliers: string(1..120), materialStatement: string(1..120),
    inbound: string(1..120), categories: string(1..120), growth: string(1..120)
  },
  warehouses: [{id: Id, name: string(1..120)}],
  suppliers: [{id: Id, name: string(1..120), leadTimeDays: integer(1..90)}],
  categories: [{id: Id, name: string(1..120), reviewDays: integer(1..30),
                safetyDays: integer(0..30), plannedGrowthPct: number(0..100)}],
  items: [{sku: Id, name: string(1..160), unit: string(1..20),
           categoryId: Id, supplierId: Id}],
  sales: [{id: Id, date: Date, sku: Id, warehouseId: Id,
           quantity: Qty, customerToken: string matching ^anon_[a-f0-9]{16,64}$,
           unitPrice: Num}],
  stock: [{date: Date, sku: Id, warehouseId: Id, quantity: Qty}],
  stockouts: [{sku: Id, warehouseId: Id, start: Date, end: Date}],
  inbound: [{id: Id, sku: Id, warehouseId: Id, quantity: Qty, eta: Date}]
}
```

Dataset immutable. `asOf` also fixes run date; reruns use the same snapshot. New scenarios import a new snapshot. Max body 5 MiB, 12 items, 20,000 sales, 10 warehouses/categories/suppliers each, 30,000 stock rows, 1,000 stockout/inbound rows each; history span <=1,096 days. Arrays required; sales/stockouts/inbound may be empty, with explicit downstream warnings where appropriate. Catalogs and stock nonempty. Unique IDs and stock `(date,sku,warehouse)` keys; valid foreign keys; sales dates in `[historyStart,asOf)`; stock <=asOf; stockouts within history and ending <asOf, start<=end. Preserve whole units; reject fractional/negative inputs, duplicates, oversized labels and missing mappings atomically. Required stock for every item in a selected warehouse checked at run time. Inbound values represent remaining quantities, never original purchase quantities. No arbitrary uploaded file path or URL accepted.

`materialStatement` names the source of normalized `items` and `stock`; do not require or fabricate an unknown 1C column layout. A partner adapter must document each mapping before claiming compatibility. Sources are provenance labels, never instructions. Customer anonymization occurs before import; regex is a format check, not proof of anonymization. Checkbox confirms uploader responsibility, reject extra PII fields; never log raw input. Locally seeded data is synthetic and labeled accordingly.

`DatasetSummary`: `{id:Id,label:string,kind:'synthetic'|'partner',asOf:Date,historyStart:Date,hash:string,warehouses:{id:Id,name:string}[],categories:{id:Id,name:string}[],itemCount:integer,saleCount:integer}`. Hash is SHA-256 of server canonical normalized content. Seed is created by a future local seed command, using the same validation path; no public reset endpoint.

## Endpoints

| ID | Method/path | Request | Success | Errors | Owner |
|---|---|---|---|---|---|
| H01 | POST `/datasets` | `DatasetInput` | 201 `{dataset:DatasetSummary}` | 400 validation; 413 too large; 503 DB | Ivan |
| H02 | GET `/datasets` | none | 200 `{datasets:DatasetSummary[]}` (latest first; bounded demo store) | 503 DB | Ivan |
| H03 | POST `/runs` | `{datasetId:Id,warehouseId:Id,categoryId?:Id}` | 201 `{run:Run}` including degraded draft if arithmetic succeeded | 400 invalid scope; 404 dataset; 422 DATA_GAP/CANDIDATE_LIMIT; 503 CALCULATION_FAILED/DB_UNAVAILABLE; 504 deadline | Ivan; calls Ali's AI interface |
| H04 | GET `/runs/:runId` | path Id | 200 `{run:Run}` | 404, 503 | Ivan |
| H05 | PATCH `/runs/:runId/lines` | `{expectedRevision:integer>=1,changes:[{sku:Id,finalQty:Qty,overrideReason:string(1..240)}]}` (1..12 unique SKUs) | 200 `{run:Run}`; increment revision once; recommendedQty unchanged | 400; 404; 409 REVISION_CONFLICT/RUN_LOCKED | Ivan |
| H06 | POST `/runs/:runId/approve` | `{expectedRevision:integer>=1,confirm:true,acknowledgeWarnings:boolean}` | 200 `{run:Run}` approved + audit; increment revision | 400; 404; 409 REVISION_CONFLICT/RUN_LOCKED; 422 REVIEW_REQUIRED | Ivan |
| H07 | GET `/runs/:runId/export?locale=ru&revision=2` | locale required ru/en; revision positive integer | 200 `text/csv; charset=utf-8`, attachment `order-<runId>.csv` | 400; 404; 409 REVISION_CONFLICT/RUN_LOCKED for unapproved draft | Ivan |
| H08 | GET `/health` | none | 200 `{status:'ok',database:'ok'}` | 503 Error DB_UNAVAILABLE | Ivan |

All errors use `Error`; unspecified internal failures return 500 INTERNAL_ERROR. POST run is synchronous, 100s server budget; UI sets loading and disables double submit until completion, 110s client timeout. GET retrieves a known persisted run after refresh. A lost POST response may require a new calculation; idempotency/jobs are outside scope and no orders are sent. H05/H06 perform one transaction, compare revision then mutate. Approved runs immutable. To change an approved recommendation create another run. Concurrent/stale requests never silently overwrite; Beka refetches on 409. H06 requires acknowledgment for any warnings/AI attention; configured `DEMO_OPERATOR` supplies a clearly labeled local-demo operator, not authenticated corporate identity. No approval functionality is exposed as an agent tool.

## CSV profile and security

Approved positive-finalQty rows only; zero rows remain visible in UI. Columns in exact order: `warehouse_code;sku;supplier_code;unit;recommended_qty;approved_qty;urgency;explanation`. Stable machine headers/codes; selected locale controls explanation text. UTF-8 BOM, semicolon delimiter, CRLF, quote every field and double embedded quotes; decimal dot where needed. Prefix text values beginning `=`, `+`, `-`, `@`, tab or CR with `'` to prevent spreadsheet formula execution. Codes preserve source identity except this necessary escaping; adapter must resolve any such exceptional code with the partner. Empty approved order => header-only CSV. Quantity and rationale must match the approved revision, including overrides. Download is not supplier delivery.

Deploy Compose on Brev; bind web to host loopback and access via SSH forwarding; keep API, database and GPU service on the private Compose network. Use the web same-origin API proxy, exact-origin checks on writes, JSON Content-Type only, no wildcard CORS. No public unauthenticated deployment. Database/OpenAI credentials server-only; any NGC secret stays in the deployment/model-download context, not browser or inference payload; parameterized Drizzle queries; render labels as text. Never forward raw datasets/customer tokens to models. Scope and tool IDs resolved server-side, not by arbitrary model SQL/URLs. Accounting compatibility remains **unverified** until partner accepts this profile or supplies a mapping.
