import { z } from 'zod';

export const IdSchema = z.string().regex(/^[A-Za-z0-9_.:-]{1,80}$/);
export const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Invalid calendar date');
export const InstantSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/).refine(value => !Number.isNaN(Date.parse(value)));
export const QtySchema = z.number().int().min(0).max(1_000_000_000);
export const NumSchema = z.number().finite().nonnegative();
export const LocaleSchema = z.enum(['ru', 'en']);
export const ErrorCodeSchema = z.enum(['VALIDATION_ERROR', 'PAYLOAD_TOO_LARGE', 'DATA_GAP', 'CANDIDATE_LIMIT', 'NOT_FOUND', 'REVISION_CONFLICT', 'RUN_LOCKED', 'REVIEW_REQUIRED', 'CALCULATION_FAILED', 'DEADLINE_EXCEEDED', 'DB_UNAVAILABLE', 'FORBIDDEN', 'INTERNAL_ERROR']);
export const WarningCodeSchema = z.enum(['INSUFFICIENT_HISTORY', 'CAPPED_TREND', 'STALE_STOCK', 'OVERDUE_INBOUND', 'ANOMALY_REVIEW', 'OPENAI_FAILED', 'GPU_WORKLOAD_UNAVAILABLE', 'DATA_GAP', 'DEMAND_RISK']);
export const RuntimeErrorCodeSchema = z.enum(['TIMEOUT', 'RATE_LIMIT', 'AUTH', 'NETWORK', 'INVALID_OUTPUT', 'RUNTIME_ERROR', 'DEADLINE', 'GPU_UNAVAILABLE', 'GPU_UNVERIFIED']);

export const ErrorSchema = z.strictObject({error: z.strictObject({code: ErrorCodeSchema, requestId: IdSchema, issues: z.array(z.strictObject({path: z.string(), code: z.string()})).optional()})});
export const WarningSchema = z.strictObject({code: WarningCodeSchema, sku: IdSchema.nullable(), evidenceIds: z.array(IdSchema).max(24)});
export const WarningsSchema = z.array(WarningSchema).max(120);
export const RuntimeStatusSchema = z.strictObject({
  runtime: z.enum(['openai', 'brev_gpu']), status: z.enum(['success', 'failed', 'skipped']),
  model: z.string().min(1).nullable(), attempts: z.number().int().min(0).max(7),
  elapsedMs: z.number().int().nonnegative(), errorCode: RuntimeErrorCodeSchema.nullable(),
  skipReason: z.enum(['no_candidates', 'not_reached']).nullable()
}).superRefine((value, ctx) => {
  if (value.runtime === 'brev_gpu' && value.attempts > 2) ctx.addIssue({code: 'custom', message: 'GPU inference attempts exceed two'});
  if (value.status === 'failed' && value.errorCode === null) ctx.addIssue({code: 'custom', message: 'Failed runtime needs errorCode'});
  if (value.status !== 'failed' && value.errorCode !== null) ctx.addIssue({code: 'custom', message: 'Only failed runtime may have errorCode'});
  if (value.status === 'skipped' && value.skipReason === null) ctx.addIssue({code: 'custom', message: 'Skipped runtime needs skipReason'});
  if (value.status !== 'skipped' && value.skipReason !== null) ctx.addIssue({code: 'custom', message: 'Only skipped runtime may have skipReason'});
  if (value.status === 'success' && value.attempts === 0) ctx.addIssue({code: 'custom', message: 'Success needs an attempt'});
});
export const MetricsSchema = z.strictObject({
  baseDaily: NumSchema, seasonFactor: NumSchema, trendFactor: NumSchema, plannedGrowthPct: NumSchema,
  leadTimeDays: z.number().int().nonnegative(), reviewDays: z.number().int().nonnegative(), safetyDays: z.number().int().nonnegative(), horizonDays: z.number().int().nonnegative(),
  forecastDaily: NumSchema, targetUnits: NumSchema, stock: QtySchema, eligibleInbound: QtySchema, laterInbound: QtySchema, overdueInbound: QtySchema,
  lostDemandUnits: NumSchema, excludedUnits: QtySchema, rawSalesQty: QtySchema
});
export const OrderLineSchema = z.strictObject({
  sku: IdSchema, name: z.string(), unit: z.string(), supplierId: IdSchema, supplierName: z.string(),
  recommendedQty: QtySchema, finalQty: QtySchema, overrideReason: z.string().min(1).max(240).nullable(),
  urgency: z.enum(['none', 'normal', 'high']), metrics: MetricsSchema,
  excludedEventIds: z.array(IdSchema).max(24), warnings: WarningsSchema
});
export const TraceEventSchema = z.strictObject({
  id: IdSchema, kind: z.enum(['tool', 'runtime', 'decision']),
  name: z.enum(['inspectDemand', 'classifyEvents', 'calculateOrders', 'openai', 'brev_gpu', 'reviewDecision']),
  status: z.enum(['success', 'failed', 'skipped']), elapsedMs: z.number().int().nonnegative(), evidenceIds: z.array(IdSchema).max(24)
});

export const CandidateSchema = z.strictObject({
  eventId: IdSchema, sku: IdSchema, date: DateSchema, quantity: QtySchema,
  medianQuantity: NumSchema, madQuantity: NumSchema, priorObservationCount: z.number().int().nonnegative(),
  recurrenceCount: z.number().int().nonnegative(), customerShare90d: z.number().min(0).max(1),
  eventValue: NumSchema, hardOneOff: z.boolean()
});
export const CandidatesSchema = z.array(CandidateSchema).max(24);
export const InspectionSchema = z.strictObject({
  scopeId: IdSchema, candidateCount: z.number().int().min(0).max(24), candidates: CandidatesSchema,
  itemCount: z.number().int().min(1).max(12), historyStart: DateSchema, asOf: DateSchema,
  sourceCounts: z.strictObject({sales: z.number().int().nonnegative(), stock: z.number().int().nonnegative(), stockouts: z.number().int().nonnegative(), inbound: z.number().int().nonnegative(), items: z.number().int().nonnegative(), suppliers: z.number().int().nonnegative(), categories: z.number().int().nonnegative(), growth: z.number().int().nonnegative()}),
  warnings: WarningsSchema
}).refine(value => value.candidateCount === value.candidates.length, 'Candidate count mismatch');
export const EvidenceCodeSchema = z.enum(['EXTREME_SIZE', 'LOW_RECURRENCE', 'REPEATED_PURCHASES', 'CUSTOMER_CONCENTRATION', 'LIMITED_HISTORY']);
export const SpecialistDecisionSchema = z.strictObject({eventId: IdSchema, label: z.enum(['one_off', 'recurring', 'uncertain']), confidence: z.number().min(0).max(1), evidenceCodes: z.array(EvidenceCodeSchema).max(5)});
export const SpecialistReportSchema = z.strictObject({decisions: z.array(SpecialistDecisionSchema).max(24)});
export const EventActionSchema = z.strictObject({eventId: IdSchema, action: z.enum(['exclude', 'retain', 'exclude_pending_review']), source: z.enum(['hard_rule', 'brev_gpu', 'degraded_rule'])});
export const CalculationSchema = z.strictObject({calculationId: IdSchema, lines: z.array(OrderLineSchema).max(12), warnings: WarningsSchema, candidates: CandidatesSchema, eventActions: z.array(EventActionSchema).max(24)});
export const AgentDecisionSchema = z.strictObject({calculationId: IdSchema, disposition: z.enum(['ready_for_review', 'needs_attention']), attention: z.array(z.strictObject({sku: IdSchema, code: z.enum(['ANOMALY_REVIEW', 'DEMAND_RISK', 'DATA_GAP']), evidenceIds: z.array(IdSchema).max(24)})).max(12)});
export const GpuEvidenceSchema = z.strictObject({
  deploymentId: IdSchema, brevInstanceId: z.string().min(1), containerId: z.string().min(1), gpuName: z.string().min(1), gpuUuid: z.string().min(1),
  runtime: z.enum(['nim', 'llama_cpp_cuda']), imageDigest: z.string().min(1), modelId: z.string().min(1), modelRevision: z.string().min(1),
  verifiedAt: InstantSchema, verificationArtifact: z.string().min(1), inferenceResponseId: z.string().min(1), requestStartedAt: InstantSchema, requestFinishedAt: InstantSchema
});
export const AiResultSchema = z.strictObject({
  mode: z.enum(['live', 'degraded']), calculationId: IdSchema, decision: AgentDecisionSchema.nullable(), specialist: SpecialistReportSchema.nullable(),
  candidates: CandidatesSchema, runtimes: z.array(RuntimeStatusSchema).length(2), gpuEvidence: GpuEvidenceSchema.nullable(),
  trace: z.array(TraceEventSchema).max(16), warnings: WarningsSchema, eventActions: z.array(EventActionSchema).max(24)
}).superRefine((value, ctx) => {
  const names = value.runtimes.map(runtime => runtime.runtime);
  if (names[0] !== 'openai' || names[1] !== 'brev_gpu') ctx.addIssue({code: 'custom', message: 'Runtime entries must be openai then brev_gpu', path: ['runtimes']});
  const gpu = value.runtimes[1];
  if (gpu?.status === 'success' && (!value.specialist || !value.gpuEvidence)) ctx.addIssue({code: 'custom', message: 'Successful GPU requires specialist and evidence'});
  if (gpu?.status !== 'success' && (value.specialist || value.gpuEvidence)) ctx.addIssue({code: 'custom', message: 'Non-successful GPU must have null specialist and evidence'});
  if (value.decision && value.decision.calculationId !== value.calculationId) ctx.addIssue({code: 'custom', message: 'Decision calculation ID mismatch'});
});
export const AiOutcomeSchema = z.discriminatedUnion('ok', [z.strictObject({ok: z.literal(true), result: AiResultSchema}), z.strictObject({ok: z.literal(false), error: z.strictObject({code: z.enum(['DATA_GAP', 'CANDIDATE_LIMIT', 'CALCULATION_FAILED', 'DEADLINE_EXCEEDED'])})})]);
export const GpuCallOutcomeSchema = z.discriminatedUnion('ok', [z.strictObject({ok: z.literal(true), report: SpecialistReportSchema, evidence: GpuEvidenceSchema}), z.strictObject({ok: z.literal(false), error: z.strictObject({code: RuntimeErrorCodeSchema})})]);
export const RunReplenishmentInputSchema = z.strictObject({runId: IdSchema, scopeId: IdSchema, deadlineMs: z.number().int().positive()});

const label = z.string().min(1).max(120);
const sku = IdSchema.max(48);
export const DatasetInputSchema = z.strictObject({
  schemaVersion: z.literal('1'), label, kind: z.enum(['synthetic', 'partner']), currency: z.string().length(3), historyStart: DateSchema, asOf: DateSchema,
  privacyConfirmed: z.literal(true),
  sources: z.strictObject({sales: label, stock: label, stockouts: label, suppliers: label, materialStatement: label, inbound: label, categories: label, growth: label}),
  warehouses: z.array(z.strictObject({id: IdSchema, name: label})).min(1).max(10),
  suppliers: z.array(z.strictObject({id: IdSchema, name: label, leadTimeDays: z.number().int().min(1).max(90)})).min(1).max(10),
  categories: z.array(z.strictObject({id: IdSchema, name: label, reviewDays: z.number().int().min(1).max(30), safetyDays: z.number().int().min(0).max(30), plannedGrowthPct: z.number().min(0).max(100)})).min(1).max(10),
  items: z.array(z.strictObject({sku, name: z.string().min(1).max(160), unit: z.string().min(1).max(20), categoryId: IdSchema, supplierId: IdSchema})).min(1).max(12),
  sales: z.array(z.strictObject({id: IdSchema, date: DateSchema, sku, warehouseId: IdSchema, quantity: QtySchema, customerToken: z.string().regex(/^anon_[a-f0-9]{16,64}$/), unitPrice: NumSchema})).max(20_000),
  stock: z.array(z.strictObject({date: DateSchema, sku, warehouseId: IdSchema, quantity: QtySchema})).min(1).max(30_000),
  stockouts: z.array(z.strictObject({sku, warehouseId: IdSchema, start: DateSchema, end: DateSchema})).max(1_000),
  inbound: z.array(z.strictObject({id: IdSchema, sku, warehouseId: IdSchema, quantity: QtySchema, eta: DateSchema})).max(1_000)
}).superRefine((data, ctx) => {
  const day = (value: string) => Date.parse(`${value}T00:00:00.000Z`);
  if (data.historyStart >= data.asOf || (day(data.asOf) - day(data.historyStart)) / 86_400_000 > 1096) ctx.addIssue({code: 'custom', path: ['asOf'], message: 'Invalid history span'});
  const unique = (values: string[], path: string) => { if (new Set(values).size !== values.length) ctx.addIssue({code: 'custom', path: [path], message: 'Duplicate identifier'}); };
  unique(data.warehouses.map(v => v.id), 'warehouses'); unique(data.suppliers.map(v => v.id), 'suppliers'); unique(data.categories.map(v => v.id), 'categories'); unique(data.items.map(v => v.sku), 'items'); unique(data.sales.map(v => v.id), 'sales'); unique(data.inbound.map(v => v.id), 'inbound'); unique(data.stock.map(v => `${v.date}:${v.sku}:${v.warehouseId}`), 'stock');
  const warehouses = new Set(data.warehouses.map(v => v.id)), suppliers = new Set(data.suppliers.map(v => v.id)), categories = new Set(data.categories.map(v => v.id)), items = new Set(data.items.map(v => v.sku));
  data.items.forEach((v, i) => { if (!categories.has(v.categoryId) || !suppliers.has(v.supplierId)) ctx.addIssue({code: 'custom', path: ['items', i], message: 'Missing category or supplier'}); });
  data.sales.forEach((v, i) => { if (!items.has(v.sku) || !warehouses.has(v.warehouseId) || v.date < data.historyStart || v.date >= data.asOf) ctx.addIssue({code: 'custom', path: ['sales', i], message: 'Invalid sale reference/date'}); });
  data.stock.forEach((v, i) => { if (!items.has(v.sku) || !warehouses.has(v.warehouseId) || v.date > data.asOf) ctx.addIssue({code: 'custom', path: ['stock', i], message: 'Invalid stock reference/date'}); });
  data.stockouts.forEach((v, i) => { if (!items.has(v.sku) || !warehouses.has(v.warehouseId) || v.start < data.historyStart || v.end >= data.asOf || v.start > v.end) ctx.addIssue({code: 'custom', path: ['stockouts', i], message: 'Invalid stockout reference/date'}); });
  data.inbound.forEach((v, i) => { if (!items.has(v.sku) || !warehouses.has(v.warehouseId)) ctx.addIssue({code: 'custom', path: ['inbound', i], message: 'Invalid inbound reference'}); });
});
export const DatasetSummarySchema = z.strictObject({id: IdSchema, label: z.string(), kind: z.enum(['synthetic', 'partner']), asOf: DateSchema, historyStart: DateSchema, hash: z.string().regex(/^[a-f0-9]{64}$/), warehouses: z.array(z.strictObject({id: IdSchema, name: z.string()})), categories: z.array(z.strictObject({id: IdSchema, name: z.string()})), itemCount: z.number().int().nonnegative(), saleCount: z.number().int().nonnegative()});
export const RunSchema = z.strictObject({
  id: IdSchema, datasetId: IdSchema, datasetHash: z.string().regex(/^[a-f0-9]{64}$/), warehouseId: IdSchema, categoryId: IdSchema.nullable(), asOf: DateSchema,
  algorithmVersion: z.literal('replenishment-v1'), status: z.enum(['draft', 'approved']), mode: z.enum(['live', 'degraded']), revision: z.number().int().min(1),
  lines: z.array(OrderLineSchema).max(12), warnings: WarningsSchema, ai: AiResultSchema,
  approvedAt: InstantSchema.nullable(), approvedBy: z.string().min(1).nullable(), createdAt: InstantSchema
}).superRefine((value, ctx) => {
  if (value.mode !== value.ai.mode) ctx.addIssue({code: 'custom', message: 'Run and AI mode differ'});
  if (value.status === 'approved' && (!value.approvedAt || !value.approvedBy)) ctx.addIssue({code: 'custom', message: 'Approved run needs approval audit'});
  if (value.status === 'draft' && (value.approvedAt || value.approvedBy)) ctx.addIssue({code: 'custom', message: 'Draft cannot have approval audit'});
});

export const CreateDatasetResponseSchema = z.strictObject({dataset: DatasetSummarySchema});
export const ListDatasetsResponseSchema = z.strictObject({datasets: z.array(DatasetSummarySchema)});
export const CreateRunBodySchema = z.strictObject({datasetId: IdSchema, warehouseId: IdSchema, categoryId: IdSchema.optional()});
export const RunResponseSchema = z.strictObject({run: RunSchema});
export const RunIdParamsSchema = z.strictObject({runId: IdSchema});
export const ChangeLinesBodySchema = z.strictObject({expectedRevision: z.number().int().min(1), changes: z.array(z.strictObject({sku: IdSchema, finalQty: QtySchema, overrideReason: z.string().min(1).max(240)})).min(1).max(12)}).refine(v => new Set(v.changes.map(c => c.sku)).size === v.changes.length, 'Duplicate SKU');
export const MoneyMinorSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const QuoteRunBodySchema = z.strictObject({
  expectedRevision: z.number().int().min(1),
  currency: z.string().regex(/^[A-Za-z]{3}$/).optional(),
  prices: z.array(z.strictObject({sku: IdSchema, unitPriceMinor: MoneyMinorSchema})).max(12),
  budgetMinor: MoneyMinorSchema.optional()
}).refine(value => new Set(value.prices.map(price => price.sku)).size === value.prices.length, 'Duplicate SKU price');
export const OrderQuoteLineSchema = z.strictObject({
  sku: IdSchema, finalQty: QtySchema, unitPriceMinor: MoneyMinorSchema.nullable(), lineTotalMinor: MoneyMinorSchema
});
export const OrderQuoteSchema = z.strictObject({
  runId: IdSchema, revision: z.number().int().min(1), currency: z.string().length(3),
  lines: z.array(OrderQuoteLineSchema).max(12), totalMinor: MoneyMinorSchema,
  budgetMinor: MoneyMinorSchema.nullable(), remainingMinor: MoneyMinorSchema.nullable(),
  overageMinor: MoneyMinorSchema.nullable(), withinBudget: z.boolean().nullable()
});
export const QuoteRunResponseSchema = z.strictObject({quote: OrderQuoteSchema});
export const ApproveRunBodySchema = z.strictObject({expectedRevision: z.number().int().min(1), confirm: z.literal(true), acknowledgeWarnings: z.boolean()});
export const ExportQuerySchema = z.strictObject({locale: LocaleSchema, revision: z.coerce.number().int().positive()});
export const HealthResponseSchema = z.strictObject({status: z.literal('ok'), database: z.literal('ok')});

export type Id = z.infer<typeof IdSchema>;
export type DatasetInput = z.infer<typeof DatasetInputSchema>;
export type DatasetSummary = z.infer<typeof DatasetSummarySchema>;
export type Candidate = z.infer<typeof CandidateSchema>;
export type Inspection = z.infer<typeof InspectionSchema>;
export type SpecialistReport = z.infer<typeof SpecialistReportSchema>;
export type Calculation = z.infer<typeof CalculationSchema>;
export type AgentDecision = z.infer<typeof AgentDecisionSchema>;
export type GpuEvidence = z.infer<typeof GpuEvidenceSchema>;
export type GpuCallOutcome = z.infer<typeof GpuCallOutcomeSchema>;
export type AiResult = z.infer<typeof AiResultSchema>;
export type AiOutcome = z.infer<typeof AiOutcomeSchema>;
export type Run = z.infer<typeof RunSchema>;
export type QuoteRunBody = z.infer<typeof QuoteRunBodySchema>;
export type OrderQuote = z.infer<typeof OrderQuoteSchema>;
export type QuoteRunResponse = z.infer<typeof QuoteRunResponseSchema>;
export type Warning = z.infer<typeof WarningSchema>;
export type RuntimeStatus = z.infer<typeof RuntimeStatusSchema>;
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;
export type ToolResult<T> = {ok: true, value: T} | {ok: false, error: {code: ErrorCode, retryable: false}};
export type ToolContext = {signal: AbortSignal};
export type BackendTools = {
  inspect(context: ToolContext): Promise<ToolResult<Inspection>>;
  calculate(input: {specialist: SpecialistReport | null}, context: ToolContext): Promise<ToolResult<Calculation>>;
};
export type RunReplenishmentInput = z.infer<typeof RunReplenishmentInputSchema>;

export function validateSpecialistReport(value: unknown, candidates: Candidate[]): SpecialistReport {
  const report = SpecialistReportSchema.parse(value);
  const byId = new Map(candidates.map(candidate => [candidate.eventId, candidate]));
  if (byId.size !== candidates.length || report.decisions.length !== candidates.length) throw new Error('Specialist event set mismatch');
  const seen = new Set<string>();
  for (const decision of report.decisions) {
    const candidate = byId.get(decision.eventId);
    if (!candidate || seen.has(decision.eventId)) throw new Error('Unknown or duplicate specialist event');
    seen.add(decision.eventId);
    if (new Set(decision.evidenceCodes).size !== decision.evidenceCodes.length) throw new Error('Duplicate evidence code');
    for (const code of decision.evidenceCodes) {
      if (code === 'EXTREME_SIZE' && !(candidate.quantity > Math.max(6 * candidate.medianQuantity, candidate.medianQuantity + 6 * candidate.madQuantity))) throw new Error('Unsupported size evidence');
      if (code === 'LOW_RECURRENCE' && candidate.recurrenceCount >= 3) throw new Error('Unsupported low recurrence evidence');
      if (code === 'REPEATED_PURCHASES' && candidate.recurrenceCount < 3) throw new Error('Unsupported repeat evidence');
      if (code === 'CUSTOMER_CONCENTRATION' && candidate.customerShare90d < 0.5) throw new Error('Unsupported concentration evidence');
      if (code === 'LIMITED_HISTORY' && candidate.priorObservationCount >= 8) throw new Error('Unsupported limited history evidence');
    }
  }
  return report;
}
