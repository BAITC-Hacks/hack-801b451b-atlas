# AI contract v1.1 — frozen implementation target

Writer: Ivan; implementation: Ali (`packages/ai/**`); backend tools: Ivan (`apps/api/**`). All transport/tool types live in `packages/contracts/**`; scalar, metrics, line, runtime and warning shapes come from [api.md](api.md). This is a specification, not implementation. Resource authority: $50 Brev GPU compute credits; OpenAI remains the external API, while the NVIDIA workload is self-hosted on Brev.

## Shared shapes

```text
Candidate = {
  eventId: Id, sku: Id, date: Date,
  quantity: Qty, medianQuantity: Num, madQuantity: Num, priorObservationCount: integer,
  recurrenceCount: integer, customerShare90d: number(0..1),
  eventValue: Num, hardOneOff: boolean
}
Inspection = {
  scopeId: Id, candidateCount: integer(0..24), candidates: Candidate[],
  itemCount: integer(1..12), historyStart: Date, asOf: Date,
  sourceCounts: {sales:integer,stock:integer,stockouts:integer,inbound:integer,
                 items:integer,suppliers:integer,categories:integer,growth:integer},
  warnings: Warning[]
}
SpecialistDecision = {
  eventId: Id, label: 'one_off'|'recurring'|'uncertain', confidence: number(0..1),
  evidenceCodes: ('EXTREME_SIZE'|'LOW_RECURRENCE'|'REPEATED_PURCHASES'|'CUSTOMER_CONCENTRATION'|'LIMITED_HISTORY')[]
}
SpecialistReport = {decisions: SpecialistDecision[]}
Calculation = {
  calculationId: Id, lines: OrderLine[], warnings: Warning[], candidates: Candidate[],
  eventActions: [{eventId:Id,action:'exclude'|'retain'|'exclude_pending_review',
                  source:'hard_rule'|'brev_gpu'|'degraded_rule'}]
}
AgentDecision = {
  calculationId: Id, disposition:'ready_for_review'|'needs_attention',
  attention:[{sku:Id,code:'ANOMALY_REVIEW'|'DEMAND_RISK'|'DATA_GAP',evidenceIds:Id[]}]
}
AiResult = {
  mode:'live'|'degraded', calculationId:Id,
  decision:AgentDecision|null, specialist:SpecialistReport|null, candidates:Candidate[],
  runtimes:RuntimeStatus[], gpuEvidence:GpuEvidence|null, trace:TraceEvent[], warnings:Warning[],
  eventActions:Calculation.eventActions
}
ToolResult<T> = {ok:true,value:T} | {ok:false,error:{code:ErrorCode,retryable:false}}
AiOutcome = {ok:true,result:AiResult} |
            {ok:false,error:{code:'DATA_GAP'|'CANDIDATE_LIMIT'|'CALCULATION_FAILED'|'DEADLINE_EXCEEDED'}}
```

All arrays bounded: <=24 candidate decisions/actions, <=12 lines/attention items (one per SKU), <=120 warnings (maximum deduplicated code/SKU combinations), <=16 trace entries, <=5 unique evidence codes per decision. Two runtime status entries exactly: openai and brev_gpu. `GpuEvidence` is defined below; it is measured deployment/request evidence, not model-generated text. No free-form narrative, SQL, URLs, user identity or hidden reasoning in model output. Labels and warnings localize from codes. No requirement for the specialist to generate Russian/English prose.

`eventId` is a backend-created opaque ID, not a customer token. Evidence IDs use `eventId` or `<sku>:<metricKey>` (e.g. `SKU1:stock`, `SKU1:lostDemandUnits`) and must resolve in the current inspection/calculation. SKU identifiers must leave enough room for the 80-character Id limit in composed evidence IDs (max 48 chars for imported SKU). IDs cannot refer outside the run. Source counts refer to normalized records in scope; growth count is number of distinct scoped category forecasts. Source values are consumed by the calculator; counts alone are not integration evidence.

## Backend ↔ AI boundary

| ID | Function | Input | Success | Failure | Owner |
|---|---|---|---|---|---|
| A01 | `runReplenishment(input, tools): Promise<AiOutcome>` | `{runId:Id,scopeId:Id,deadlineMs:integer}` plus `BackendTools` dependency | `AiOutcome.ok=true` with actual evidence and calculationId | Typed AiOutcome error; never uncaught OpenAI/GPU transport exception | Ali |
| T01 | `BackendTools.inspect(context): Promise<ToolResult<Inspection>>` | none; closure binds validated dataset/warehouse/category | `Inspection` | DATA_GAP, CANDIDATE_LIMIT, CALCULATION_FAILED | Ivan |
| T02 | `BackendTools.calculate(input, context): Promise<ToolResult<Calculation>>` | `{specialist:SpecialistReport|null}` from the validated GPU inference cache only | `Calculation` with immutable numeric rows | DATA_GAP, CANDIDATE_LIMIT, CALCULATION_FAILED | Ivan |

Backend allocates runId/scopeId; deadline is absolute UTC epoch milliseconds, now+90,000, never supplied by browser/model. Tool callbacks accept non-model `context:{signal:AbortSignal}` (sole argument of inspect, second argument of calculate); Ali supplies the current bounded signal, including a fresh fallback signal when needed. Calculation caches are request-local until successful persistence. T02 runs the same inspection internally if T01 was never reached; it enforces candidate limits and returns safe candidates for persisted UI evidence even on fallback. No extra OpenAI/GPU inference is implied. Backend validates A01 result, resolves calculationId to its own T02 result, and persists *its* calculated rows, never a model copy. Persist warnings as union of calculator + runtime + decision attention (deduplicate by code/SKU/evidence); derive final mode and required acknowledgment server-side. If fatal AiOutcome, no order draft is created. No direct AI SQL/network access except OpenAI and the configured private GPU service.

## OpenAI-facing tools (Ali registers; names frozen)

| ID | Function | Model input | Observation/output | Failure | Owner |
|---|---|---|---|---|---|
| AT01 | `inspectDemand` | strict empty object `{}` | T01 result | typed tool error; stop if fatal | Ali wrapper → Ivan T01 |
| AT02 | `classifyEvents` | strict empty object `{}` | `{status:'success',report:SpecialistReport}` OR `{status:'skipped',reason:'no_candidates'}` OR `{status:'failed',code:RuntimeErrorCode}` | Failure saved honestly; calculation may proceed | Ali |
| AT03 | `calculateOrders` | strict empty object `{}` | T02 result, retaining only required numeric metrics/IDs in model observation | fatal typed tool error | Ali wrapper → Ivan T02 |

Protocol: inspect → classify → calculate → AgentDecision. Enforce via available-tool gating; <=6 model turns, <=3 normal tool invocations. Agent must invoke tools, observe results and decide whether attention is needed. Tools are run-scoped/read-only with respect to approval; each successful tool is memoized within the run to avoid duplicate work. Out-of-order calls fail locally; no side effects or fabricated result. AT02 reads candidates from cached Inspection. AT03 reads validated cached SpecialistReport, or null after recorded GPU workload unavailability/skip. The model cannot inject reports, arbitrary IDs or quantity overrides. Candidate-free run records a skip honestly; main demo must include candidates.

## OpenAI and Brev GPU boundaries

| ID | Request/function | Typed output | Effect/evidence | Owner |
|---|---|---|---|---|
| P01 | OpenAI Agents SDK: goal/protocol, scope ID, safe Inspection/Calculation and SpecialistReport observations; `OPENAI_MODEL` | `AgentDecision`, strict schema and references | Tool orchestration + review; actual OpenAI call metadata | Ali |
| P02 | `classifyOnGpu({candidates:Candidate[]}, context): Promise<GpuCallOutcome>`; fixed case rubric, private HTTP G01 | `{ok:true,report:SpecialistReport,evidence:GpuEvidence}` OR `{ok:false,error:{code:RuntimeErrorCode}}` | F03 exclusions/review plus measured GPU evidence; no hosted NVIDIA call | Ali |
| G01 | POST `GPU_SERVICE_URL + /v1/chat/completions` (default base `http://gpu-specialist:8000`); details below | Chat response parsed to SpecialistReport | Actual inference inside selected Brev GPU container | Ali: adapter; Ivan: Compose |
| G02 | GET `GPU_SERVICE_URL + /v1/models`; 2s timeout, no retry | `{data:[{id:string}]}` (extra server metadata tolerated); must include configured GPU_MODEL_ID | Model readiness only; separate deployment evidence must prove GPU use | Ali |

P02 context is `{signal:AbortSignal,deadlineMs:integer}` supplied by Ali's run controller; failures always use a non-null RuntimeErrorCode. The GPU result and evidence are accepted together or both remain null.

**G01 wire contract:** adapter constructs `{model:GPU_MODEL_ID,messages:[{role:'system',content:fixedRubric},{role:'user',content:JSON.stringify({candidates})}],temperature:0,max_tokens:4096,stream:false}`. No arbitrary user prompt is accepted. HTTP success projection is `{id:string,model:string,choices:[{index:0,message:{role:'assistant',content:string},finish_reason:'stop'}]}`; ignore standard extra metadata, reject missing content, truncation/tool output and wrong model (a server alias must be pinned explicitly). Parse content once as JSON into strict SpecialistReport; no repairing invented labels. If selected runtime supports a compatible response_format schema, pin that option in the adapter during smoke verification; correctness still requires Zod validation. Bounded response body <=64 KiB. Non-2xx, disconnect, OOM/unavailable model, invalid JSON, missing GPU proof and timeout become typed errors. Raw server error bodies stay out of browser responses. Internal plain HTTP is allowed only on the private Compose network. No hosted provider auth or NGC token is sent to this endpoint.

P02 receives no raw customer tokens; concentration/recurrence are backend-computed. Output must contain exactly one decision for each supplied event, no duplicate/unknown IDs. Threshold 0.8 is a heuristic, not calibrated probability. Evidence must agree with observable facts: EXTREME_SIZE requires candidate threshold, LOW_RECURRENCE requires <3, REPEATED_PURCHASES >=3, CUSTOMER_CONCENTRATION >=0.5, LIMITED_HISTORY <8 prior observations. Invalid evidence invalidates the entire result. Retention requires recurrence safeguard; hard exclusions cannot be overridden. Cache actual validated report for the current run only. OpenAI cannot manufacture it.

### GPU execution evidence

```text
GpuEvidence = {
  deploymentId: Id, brevInstanceId: string, containerId: string,
  gpuName: string, gpuUuid: string,
  runtime: 'nim'|'llama_cpp_cuda', imageDigest: string,
  modelId: string, modelRevision: string,
  verifiedAt: Instant, verificationArtifact: string,
  inferenceResponseId: string, requestStartedAt: Instant, requestFinishedAt: Instant
}
```

Ivan/Ali capture an actual deployment verification artifact: Brev instance identity, container/image identity, selected model revision/checksum, CUDA/GPU-offload startup logs, and a completed warmup inference correlated with GPU process/compute activity on that instance. Include the workload PID/GPU association and CUDA execution or profiler/compute telemetry evidence; GPU presence/allocated memory alone is insufficient. For llama.cpp request all model layers on GPU and verify actual offload in logs. For NIM verify its selected GPU execution profile. `verificationArtifact` is a repository-relative evidence reference, not an executable path or model-supplied URL. Public UI may show a safe summary rather than expose infrastructure identifiers.

The adapter attaches observed G01 response ID/timestamps to the current deployment evidence. It must not invent GPU fields from the model response or assume CUDA merely because the image name contains it. Bootstrap creates the record from real checks; read-only mount into API, never handwritten success flags. Record is invalidated/recreated on instance/container/model changes or restart; no current matching record => GPU_UNVERIFIED and no accepted specialist report. Continuous hardware attestation is outside scope; the judge proof additionally correlates the main demo request with GPU compute telemetry, not only the earlier warmup.

This is planned evidence capture, not a claim that a GPU has been provisioned or tested. Deploy NIM when quickly feasible; otherwise the small CUDA container in product-spec.md. A CPU path must never set brev_gpu success. Native runtime health/model endpoints vary; freeze the selected image's confirmed behavior while retaining these normalized contracts.

P01 final calculationId must match T02; attention SKUs/evidence must exist; decision cannot approve or suppress calculator/runtime warnings. If any warnings remain, backend requires acknowledgment regardless of `ready_for_review`. Preserve the original validated decision unchanged; UI displays it alongside the enforced warning state. No extra decision field or fabricated model response is introduced.

## Timeouts, retry and degraded path

- OpenAI: 15s/model HTTP request, <=6 turns, <=1 transient retry total/run; disable SDK automatic retries. Brev GPU: 10s/warmed inference request, <=1 retry, one batch<=24; readiness probe 2s, no retry. Retry network/429/5xx with <=500ms backoff; no retry for bad credentials, invalid output or missing GPU proof. All calls/probes count against the 90s AI deadline. Warmup/image/model downloads happen at deployment, not during a user request.
- T01/T02: 5s each. API100s including fallback/persistence; 504 if no valid result can be stored. A01 may call T02 once more in its reserved5s fallback budget with a fresh bounded AbortSignal.
- **Brev/NVIDIA GPU workload unavailable, timed out or unverified:** record brev_gpu failed with actual attempt/duration/model/error; specialist=null, gpuEvidence=null; T02 uses hard/provisional deterministic exclusions, warning GPU_WORKLOAD_UNAVAILABLE, mode degraded, human acknowledgment required. No fake classification, CPU substitution or fabricated GPU proof. Explicit test-only stubs cannot satisfy runtime evidence.
- OpenAI fails/invalid output/max-turn/deadline: decision=null, openai failed. Reuse valid T02 result; otherwise calculate with the actual validated GPU report/evidence already obtained or null. Record fallback tool execution. GPU not reached => skipped/not_reached, not success. Failed fallback arithmetic returns fatal AiOutcome.
- No candidates: brev_gpu skipped/no_candidates, specialist=null, gpuEvidence=null, no GPU_WORKLOAD_UNAVAILABLE warning; OpenAI-success run may be live but cannot prove the required GPU integration. Mode degraded if either runtime failed or GPU was not reached.
- UI translates runtime statuses in RU/EN, including warming/unavailable/timeout/unverified. Secrets: OpenAI key only in API; optional NGC deployment key only where selected image/model requires it. Local GPU HTTP needs no external API credential. Do not export complete prompts/rows. Persist only safe classifications, numeric observations, actual request metadata and GPU evidence references.

## Verification boundary

Ali verifies schema rejection, bad/duplicate evidence IDs, timeout, retry cap, invalid final decision, no-candidate skip and tool ordering. Ivan verifies unchanged arithmetic/exclusion fixtures and T02 guards. Integration must prove (a) real OpenAI API response, (b) inference on an NVIDIA GPU on Brev, (c) specialist output changes a borderline event's retention/review under F03 versus honest no-specialist calculation, and (d) stopping GPU service produces unavailable/degraded status with no fabricated output and warning acknowledgment before H06. Save the same run's GPU telemetry and inference response correlation; no claim of completion from HTTP success or mocks alone. Clean Compose reproduction includes model cache/bootstrap, GPU reservation and private service network; no instance was launched in START.
