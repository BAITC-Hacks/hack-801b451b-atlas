import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AiResultSchema, type DatasetSummary } from '@atlas/contracts';
import { datasetHash } from '@atlas/db';
import { buildSyntheticDataset } from '../../../packages/db/src/fixture.js';
import { calculateDemand, inspectDemand } from '../src/calculation/index.js';
import { assembleDraft } from '../src/runs/assemble.js';

test('isolated draft assembly uses backend numbers and derives degraded warnings', () => {
  const input = buildSyntheticDataset();
  const dataset: DatasetSummary = {
    id: 'dataset_test', label: input.label, kind: input.kind, asOf: input.asOf,
    historyStart: input.historyStart, hash: datasetHash(input),
    warehouses: input.warehouses, categories: input.categories.map(({id, name}) => ({id, name})),
    itemCount: input.items.length, saleCount: input.sales.length
  };
  const scope = {input, warehouseId: 'WH_DEMO', categoryId: 'CAT_STABLE', scopeId: 'scope_test'};
  const inspected = inspectDemand(scope);
  const calculation = calculateDemand(scope, inspected, null);
  const ai = AiResultSchema.parse({
    mode: 'live', calculationId: calculation.calculationId,
    decision: {calculationId: calculation.calculationId, disposition: 'needs_attention', attention: []},
    specialist: null, candidates: calculation.candidates, eventActions: calculation.eventActions,
    runtimes: [
      {runtime: 'openai', status: 'success', model: 'fixture-model', attempts: 1, elapsedMs: 1, errorCode: null, skipReason: null},
      {runtime: 'brev_gpu', status: 'failed', model: null, attempts: 0, elapsedMs: 0, errorCode: 'GPU_UNAVAILABLE', skipReason: null}
    ], gpuEvidence: null, trace: [], warnings: []
  });
  const draft = assembleDraft({runId: 'run_test', dataset, warehouseId: 'WH_DEMO', categoryId: 'CAT_STABLE', ai, calculation});
  assert.equal(draft.mode, 'degraded');
  assert.equal(draft.ai.mode, 'degraded');
  assert.deepEqual(draft.lines, calculation.lines);
  assert.ok(draft.warnings.some(warning => warning.code === 'GPU_WORKLOAD_UNAVAILABLE'));
  assert.throws(() => assembleDraft({runId: 'run_test', dataset, warehouseId: 'WH_DEMO', categoryId: 'CAT_STABLE', ai,
    calculation: {...calculation, calculationId: 'calc_other'}}));
});
