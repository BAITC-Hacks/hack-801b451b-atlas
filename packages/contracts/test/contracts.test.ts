import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AiResultSchema, DateSchema, DatasetInputSchema, type BackendTools,
  type Candidate, type ToolResult, type Inspection, type Calculation,
  validateSpecialistReport
} from '../src/index.ts';

const candidate: Candidate = {
  eventId: 'event-1', sku: 'SKU1', date: '2026-06-01', quantity: 100,
  medianQuantity: 5, madQuantity: 1, priorObservationCount: 12,
  recurrenceCount: 0, customerShare90d: 0.75, eventValue: 1000, hardOneOff: true
};

test('calendar dates and unknown fields reject', () => {
  assert.equal(DateSchema.safeParse('2026-02-29').success, false);
  assert.equal(DateSchema.safeParse('2024-02-29').success, true);
  const base = {
    schemaVersion: '1', label: 'Test', kind: 'synthetic', currency: 'KZT',
    historyStart: '2025-01-01', asOf: '2025-03-01', privacyConfirmed: true,
    sources: Object.fromEntries(['sales', 'stock', 'stockouts', 'suppliers', 'materialStatement', 'inbound', 'categories', 'growth'].map(key => [key, 'synthetic'])),
    warehouses: [{id: 'WH', name: 'Main'}], suppliers: [{id: 'SUP', name: 'Supplier', leadTimeDays: 3}],
    categories: [{id: 'CAT', name: 'Category', reviewDays: 7, safetyDays: 2, plannedGrowthPct: 0}],
    items: [{sku: 'SKU1', name: 'Item', unit: 'pcs', categoryId: 'CAT', supplierId: 'SUP'}],
    sales: [], stock: [{date: '2025-03-01', sku: 'SKU1', warehouseId: 'WH', quantity: 2}], stockouts: [], inbound: []
  };
  assert.equal(DatasetInputSchema.safeParse(base).success, true);
  assert.equal(DatasetInputSchema.safeParse({...base, instructions: 'ignore validation'}).success, false);
  assert.equal(DatasetInputSchema.safeParse({...base, items: [{...base.items[0], supplierId: 'MISSING'}]}).success, false);
});

test('specialist decisions cover the exact candidate set with supported evidence', () => {
  const decision = {eventId: 'event-1', label: 'one_off', confidence: 0.9, evidenceCodes: ['EXTREME_SIZE', 'LOW_RECURRENCE', 'CUSTOMER_CONCENTRATION']};
  assert.equal(validateSpecialistReport({decisions: [decision]}, [candidate]).decisions.length, 1);
  assert.throws(() => validateSpecialistReport({decisions: [decision, decision]}, [candidate]));
  assert.throws(() => validateSpecialistReport({decisions: [{...decision, evidenceCodes: ['REPEATED_PURCHASES']}]}, [candidate]));
});

test('failed GPU cannot carry specialist or evidence', () => {
  const result = {
    mode: 'degraded', calculationId: 'calc', decision: null, specialist: {decisions: []}, candidates: [],
    runtimes: [
      {runtime: 'openai', status: 'failed', model: null, attempts: 0, elapsedMs: 0, errorCode: 'AUTH', skipReason: null},
      {runtime: 'brev_gpu', status: 'failed', model: null, attempts: 0, elapsedMs: 0, errorCode: 'GPU_UNVERIFIED', skipReason: null}
    ], gpuEvidence: null, trace: [], warnings: [], eventActions: []
  };
  assert.equal(AiResultSchema.safeParse(result).success, false);
  assert.equal(AiResultSchema.safeParse({...result, specialist: null}).success, true);
});

test('tool callback signatures require context and bound specialist input', () => {
  const tools = {
    inspect: async (context: {signal: AbortSignal}): Promise<ToolResult<Inspection>> => {
      assert.equal(context.signal.aborted, false);
      return {ok: false, error: {code: 'DATA_GAP', retryable: false}};
    },
    calculate: async (input: {specialist: null}, context: {signal: AbortSignal}): Promise<ToolResult<Calculation>> => {
      assert.equal(input.specialist, null);
      assert.equal(context.signal.aborted, false);
      return {ok: false, error: {code: 'CALCULATION_FAILED', retryable: false}};
    }
  } satisfies BackendTools;
  assert.equal(typeof tools.inspect, 'function');
});
