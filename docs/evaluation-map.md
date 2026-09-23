# Requirement and evaluation evidence map

All evidence below is **planned, not yet implemented or verified**. C IDs trace [the full case checklist](case.md); F IDs trace [the product scope](product-spec.md). Owners refer to implementation responsibilities; exclusive write scopes remain in AGENTS.md.

| Requirement | Feature | Implementation evidence to produce | Judge/demo evidence | Owner |
|---|---|---|---|---|
| C01 Baseline uses every supplied source | F01,F02 | Dataset schema/provenance; versioned calculator; positive sensitivity fixtures for sales, stock, inbound, category horizon and external growth | 10/day ×14−40−20=80; inbound +20 gives60; show each input contribution and independent counterfactual | Ivan |
| C02 Seasonality + sustained growth | F02 | Corrected monthly seasonal indices, sustained weekly trend gate; seasonal and rising-series fixtures | Peak forecast exceeds off-season; sustained increase raises need vs flat series | Ivan |
| C03 Lost stockout demand | F02 | Stockout interval merge + daily imputation; no-imputation counterfactual | Stockout SKU has lostDemandUnits>0 and recommendedQty>rawSalesQty on fixture | Ivan |
| C04 Exclude one-off large customer orders | F03 | Customer/SKU/day aggregation; robust candidates/hard exclusions; Brev GPU specialist schema and retained/excluded event audit | Add isolated100× spike, including split rows: change <=max(1 unit,5% baseline); inspect borderline specialist effect and recurring buyer safeguard | Ivan/Ali |
| C05 Supplier grouping and per-line rationale | F05 | H03/H04 OrderLine, numeric Metrics, deterministic bilingual explanation templates | Expand each supplier; every line shows quantity math and excluded events | Ivan/Beka |
| C06 Warehouse/category → review/edit/approve | F01,F05 | H02–H06; immutable recommendations, override reasons, revision transaction and audit | Filter category, calculate, adjust one row, approve, reload; original quantity preserved | Ivan/Beka |
| C07 Complete specified inputs including 1C statement | F01,F02 | All DatasetInput sources, sales price/customer/date, stockout/lead-time records; normalized item/stock mapping | Show seeded source labels and corresponding numeric contributions; partner adapter pending actual sample | Ivan |
| C08 V2/dynamics/name/warehouse/stock date + long history | F01 | 24-month labeled synthetic data; identifiers/names/dated stock snapshots; source provenance | Inspect dataset metadata; explicitly identify synthetic versus partner data; unknown partner volume/date disclosed | Ivan |
| C09 Output fields, urgency, table and export | F05 | Supplier/SKU/quantity/rationale/urgency fields; H07 CSV serializer/profile | Download approved CSV and compare quantities to screen; explain header-only no-order case | Ivan/Beka |
| C10 Anonymization and privacy | F01,F07 | Strict token schema + source confirmation; reject extra PII fields; OpenAI/GPU payload whitelist; local binding/server secrets | Reject input with customer name/email fields; inspect redacted inference request shape, no keys in browser | Ivan/Ali |
| C11 No automatic supplier sending without approval | F05,F07 | No send tool/endpoint; explicit H06, revision check and warning acknowledgment | Before approval export blocked; human approves; CSV download creates no supplier network request | Ivan |
| C12 Explainability/anomaly robustness | F02,F03,F07 | Contribution ledger, strict FK/date/unit validation; anomaly and malformed-data cases | Invalid dataset gives useful RU/EN errors, outlier excluded, arithmetic trace accessible | Ivan/Ali/Beka |
| C13 Accounting-system-compatible output | F05,F08 | Stable source codes/unit, explicit CSV profile; partner column mapping and accepted sample when available | Inspect CSV codes/quantities; actual 1C import/partner validation **pending format**, never claim it already works | Ivan |
| C14 Repository + README methodology/outlier/run instructions | F08 | Versioned source, final verified runbook; link formula and exclusion method | Judge follows exact clean-start commands; README states actual limitations/results | Ivan |
| User: RU + EN, all demo states, visible switcher | F06 | Matching ru/en keys; no UI literals; API codes; localized CSV rationale | Switch language in ready/loading/error/empty/success and approval screens | Beka; Ivan export |
| User: OpenAI API + real NVIDIA GPU workload on Brev ($50 compute credits) | F03,F04 | Agents SDK loop; private typed GPU HTTP adapter; actual model/image and GPU verification artifact | Real OpenAI call + same-run GPU inference/compute evidence on Brev + changed borderline retention/review versus no-specialist result | Ali; Ivan deployment |
| User: timeout/retry/typed/failure boundaries | F04,F07 | 90s model budget, bounded retries, Zod validation, deterministic degraded calculation | Invalid OpenAI key or stopped/timed-out/unverified GPU service yields failed runtime + review-required draft, null failed-runtime output; no fake success | Ali/Ivan |
| User: fixed ownership, minimal stack and scope | F08 | AGENTS.md; shared contracts and monorepo; deviation table if needed | Review ownership and small runtime topology; eight MUST features | Ivan |
| User: disclose harness/templates/external resources | F08 | README disclosures + source/license/model/seed records as used | Explain baseline planning template and distinguish synthetic data from real OpenAI/GPU inference | Ivan |

Optional case requests are preserved: O01 advanced risk prioritization and O03 charts are SHOULD; O02 MOQ/terms and O04 automated supplier sending are CUT. Basic urgency and explicit CSV export remain MUST.

## Five scoring categories (100 total)

| Category | Points | Concrete repository evidence | Demo/reproduction evidence | Owner |
|---|---:|---|---|---|
| Case compliance and functionality | 20 | C01–C14 map, all eight MUST features, partner-format gap visibly tracked | Full order workflow + numerical season/growth/stockout/outlier/source tests | All within lanes |
| Technical implementation | 25 | Fastify/Zod contracts, Drizzle persistence, deterministic calculator, bounded Agents SDK loop + distinct Brev GPU adapter | Real DB save/reload, a live OpenAI call and real Brev GPU inference, revision-safe approval | Ivan/Ali/Beka |
| README and technical documentation | 20 | Case verbatim, method/outlier explanation, HTTP/AI contracts, limitations, disclosures, verified runbook | Judge can identify formula, agent responsibilities and unsupported cases | Ivan |
| Reproducibility/deployment readiness | 20 | Pinned pnpm lockfile, workspace, root Brev Compose with GPU reservation/private service/cache, migrations/seed, `.env.example`, health/readiness and model/image pinning | Fresh checkout → documented install/env/migrate/seed/start → health → seeded UI; OpenAI credential explicit; conditional NGC deployment access separate; actual $50 compute budget and shutdown documented | Ivan |
| Basic reliability/security | 15 | Validation/foreign-key checks, private secrets, redacted inputs, timeout/retry caps, CSV formula escaping, local-only boundary, approval transaction | Malformed input, OpenAI failure/GPU workload unavailability, stale-revision rejection and unauthorized-origin rejection | Ivan/Ali/Beka |

## Minimum submission verification record

Record commands and actual pass/fail evidence in README before claiming completion: typecheck/build; deterministic arithmetic/sensitivity and forecast/outlier fixtures; API import/run/edit/approve/export/reload; AI schema/degraded checks; real OpenAI + Brev GPU slice; RU/EN state review; fresh Compose reproduction. No large test suite required. Missing 1C sample, OpenAI access, Brev GPU/image/model access or any failing mandatory check stays explicitly visible; mocks or CPU substitution never satisfy GPU runtime evidence. Capture actual Brev instance/container/GPU identity, startup CUDA offload/profile and inference-correlated compute activity; HTTP200, VRAM allocation and a GPU listing alone do not prove inference. No hosted NVIDIA entitlement is assumed.
