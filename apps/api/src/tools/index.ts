import { createHash } from 'node:crypto';
import { IdSchema, type BackendTools, type Calculation } from '@atlas/contracts';
import { createDb } from '@atlas/db';
import { CalculationError, calculateDemand, inspectDemand, type DemandScope } from '../calculation/index.js';

export type DemandToolsScope = {datasetId: string; warehouseId: string; categoryId?: string; runId: string};

export async function createDemandTools(input: DemandToolsScope): Promise<{
  scopeId: string; tools: BackendTools; lookupCalculation: (id: string) => Calculation | null
}> {
  IdSchema.parse(input.datasetId); IdSchema.parse(input.warehouseId); IdSchema.parse(input.runId);
  if (input.categoryId !== undefined) IdSchema.parse(input.categoryId);
  const db = createDb();
  let snapshot: Awaited<ReturnType<typeof db.getDataset>>;
  try { snapshot = await db.getDataset(input.datasetId); }
  finally { await db.close(); }
  if (!snapshot) throw new CalculationError('DATA_GAP');
  if (!snapshot.input.warehouses.some(warehouse => warehouse.id === input.warehouseId) ||
      (input.categoryId !== undefined && !snapshot.input.categories.some(category => category.id === input.categoryId)) ||
      !snapshot.input.items.some(item => input.categoryId === undefined || item.categoryId === input.categoryId)) {
    throw new CalculationError('DATA_GAP');
  }
  const categoryId = input.categoryId ?? null;
  const scopeId = `scope_${createHash('sha256').update(`${input.runId}:${snapshot.summary.hash}:${input.warehouseId}:${categoryId ?? ''}`)
    .digest('hex').slice(0, 32)}`;
  const scope: DemandScope = {input: snapshot.input, warehouseId: input.warehouseId, categoryId, scopeId};
  let inspected: ReturnType<typeof inspectDemand> | null = null;
  let calculated: Calculation | null = null;
  let calculatedWith: string | null = null;
  const toolError = (error: unknown): {ok: false; error: {code: CalculationError['code']; retryable: false}} =>
    ({ok: false, error: {code: error instanceof CalculationError ? error.code : 'CALCULATION_FAILED', retryable: false}});
  const tools: BackendTools = {
    async inspect({signal}) {
      try {
        if (signal.aborted) throw new CalculationError('CALCULATION_FAILED');
        if (!inspected) inspected = inspectDemand(scope, signal);
        return {ok: true, value: inspected.inspection};
      } catch (error) { return toolError(error); }
    },
    async calculate({specialist}, {signal}) {
      try {
        if (signal.aborted) throw new CalculationError('CALCULATION_FAILED');
        if (!inspected) inspected = inspectDemand(scope, signal);
        const key = JSON.stringify(specialist);
        if (calculated && calculatedWith !== key) throw new CalculationError('CALCULATION_FAILED');
        if (!calculated) {
          calculated = calculateDemand(scope, inspected, specialist, signal);
          calculatedWith = key;
        }
        return {ok: true, value: calculated};
      } catch (error) { return toolError(error); }
    }
  };
  return {scopeId, tools, lookupCalculation: id => calculated?.calculationId === id ? calculated : null};
}
