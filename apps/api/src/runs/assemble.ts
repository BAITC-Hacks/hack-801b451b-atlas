import {
  AiResultSchema, CalculationSchema, RunSchema,
  type AiResult, type Calculation, type DatasetSummary, type Run, type Warning
} from '@atlas/contracts';

function sameData(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function uniqueWarnings(warnings: Warning[]): Warning[] {
  const seen = new Set<string>();
  return warnings.filter(warning => {
    const key = `${warning.code}\0${warning.sku ?? ''}\0${warning.evidenceIds.join('\0')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function assembleDraft(input: {
  runId: string;
  dataset: DatasetSummary;
  warehouseId: string;
  categoryId: string | null;
  ai: AiResult;
  calculation: Calculation;
  createdAt?: string;
}): Run {
  const ai = AiResultSchema.parse(input.ai);
  const calculation = CalculationSchema.parse(input.calculation);
  if (ai.calculationId !== calculation.calculationId ||
      !sameData(ai.candidates, calculation.candidates) ||
      !sameData(ai.eventActions, calculation.eventActions)) {
    throw new Error('AI result does not reference the backend calculation');
  }
  const scopedSkus = new Set(calculation.lines.map(line => line.sku));
  const evidenceIds = new Set<string>(calculation.candidates.map(candidate => candidate.eventId));
  for (const line of calculation.lines) {
    for (const metric of Object.keys(line.metrics)) evidenceIds.add(`${line.sku}:${metric}`);
  }
  for (const attention of ai.decision?.attention ?? []) {
    if (!scopedSkus.has(attention.sku) || attention.evidenceIds.some(id => !evidenceIds.has(id))) {
      throw new Error('AI attention references an unknown SKU or evidence ID');
    }
  }
  const [openai, gpu] = ai.runtimes;
  if ((openai?.status === 'success') !== (ai.decision !== null) ||
      (gpu?.status === 'success' && calculation.candidates.length === 0)) {
    throw new Error('AI runtime status is inconsistent with its decision or candidates');
  }
  const warnings = uniqueWarnings([
    ...calculation.warnings,
    ...ai.warnings,
    ...((ai.decision?.attention ?? []).map(item => ({code: item.code, sku: item.sku, evidenceIds: item.evidenceIds}))),
    ...(openai?.status === 'failed' ? [{code: 'OPENAI_FAILED' as const, sku: null, evidenceIds: []}] : []),
    ...(gpu?.status === 'failed' ? [{code: 'GPU_WORKLOAD_UNAVAILABLE' as const, sku: null, evidenceIds: []}] : [])
  ]);
  const mode = openai?.status === 'success' && gpu?.status === 'success' ? 'live' : 'degraded';
  const result = AiResultSchema.parse({...ai, mode, warnings});
  return RunSchema.parse({
    id: input.runId,
    datasetId: input.dataset.id,
    datasetHash: input.dataset.hash,
    warehouseId: input.warehouseId,
    categoryId: input.categoryId,
    asOf: input.dataset.asOf,
    algorithmVersion: 'replenishment-v1',
    status: 'draft', mode, revision: 1,
    lines: calculation.lines, warnings, ai: result,
    approvedAt: null, approvedBy: null,
    createdAt: input.createdAt ?? new Date().toISOString()
  });
}
