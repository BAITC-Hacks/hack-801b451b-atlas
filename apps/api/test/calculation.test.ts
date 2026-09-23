import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatasetInputSchema, type DatasetInput, type SpecialistReport } from '@atlas/contracts';
import { CalculationError, calculateDemand, inspectDemand, type DemandScope } from '../src/calculation/index.js';
import { createDemandTools } from '../src/tools/index.js';
import { createDb } from '@atlas/db';
import { buildSyntheticDataset } from '../../../packages/db/src/fixture.js';
import { loadRepositoryEnv } from '../src/config.js';

const dayMs = 86_400_000;
function fixture(options: {
  historyStart?: string; asOf?: string; daily?: (date: string, index: number) => number;
  stock?: number; inbound?: number; reviewDays?: number; growth?: number;
  stockouts?: DatasetInput['stockouts']; extraSales?: DatasetInput['sales'];
} = {}): DatasetInput {
  const historyStart = options.historyStart ?? '2025-01-01';
  const asOf = options.asOf ?? '2026-01-01';
  const sales: DatasetInput['sales'] = [];
  let index = 0;
  for (let day = Date.parse(`${historyStart}T00:00:00Z`); day < Date.parse(`${asOf}T00:00:00Z`); day += dayMs) {
    const date = new Date(day).toISOString().slice(0, 10);
    sales.push({id: `base_${index}`, date, sku: 'SKU', warehouseId: 'WH', quantity: options.daily?.(date, index) ?? 10,
      customerToken: `anon_${(index + 1).toString(16).padStart(16, '0')}`, unitPrice: 1});
    index++;
  }
  return DatasetInputSchema.parse({schemaVersion: '1', label: 'Synthetic calculation fixture', kind: 'synthetic',
    currency: 'KZT', historyStart, asOf, privacyConfirmed: true,
    sources: {sales: 'synthetic sales', stock: 'synthetic stock', stockouts: 'synthetic stockouts',
      suppliers: 'synthetic suppliers', materialStatement: 'synthetic normalized material',
      inbound: 'synthetic inbound', categories: 'synthetic categories', growth: 'synthetic growth'},
    warehouses: [{id: 'WH', name: 'Warehouse'}], suppliers: [{id: 'SUP', name: 'Supplier', leadTimeDays: 7}],
    categories: [{id: 'CAT', name: 'Category', reviewDays: options.reviewDays ?? 7, safetyDays: 0,
      plannedGrowthPct: options.growth ?? 0}],
    items: [{sku: 'SKU', name: 'Item', unit: 'pcs', categoryId: 'CAT', supplierId: 'SUP'}],
    sales: [...sales, ...(options.extraSales ?? [])],
    stock: options.stock === undefined ? [{date: new Date(Date.parse(`${asOf}T00:00:00Z`) - dayMs).toISOString().slice(0, 10),
      sku: 'SKU', warehouseId: 'WH', quantity: 40}] : [{date: new Date(Date.parse(`${asOf}T00:00:00Z`) - dayMs).toISOString().slice(0, 10),
      sku: 'SKU', warehouseId: 'WH', quantity: options.stock}],
    stockouts: options.stockouts ?? [],
    inbound: [{id: 'IN', sku: 'SKU', warehouseId: 'WH', quantity: options.inbound ?? 20, eta: asOf}]
  });
}
function scope(input: DatasetInput): DemandScope { return {input, warehouseId: 'WH', categoryId: 'CAT', scopeId: 'scope_test'}; }
function calculate(input: DatasetInput, specialist: SpecialistReport | null = null) {
  const selected = scope(input);
  const inspected = inspectDemand(selected);
  return calculateDemand(selected, inspected, specialist);
}

test('exact replenishment arithmetic and source sensitivity', () => {
  const base = calculate(fixture());
  assert.equal(base.lines[0]?.recommendedQty, 80);
  assert.equal(base.lines[0]?.metrics.baseDaily, 10);
  assert.equal(base.lines[0]?.metrics.seasonFactor, 1);
  assert.equal(base.lines[0]?.metrics.trendFactor, 1);
  assert.equal(base.lines[0]?.metrics.horizonDays, 14);
  assert.equal(base.lines[0]?.metrics.rawSalesQty, 80);
  assert.equal(calculate(fixture({inbound: 40})).lines[0]?.recommendedQty, 60);
  assert.equal(calculate(fixture({reviewDays: 8})).lines[0]?.recommendedQty, 90);
  assert.equal(calculate(fixture({growth: 10})).lines[0]?.recommendedQty, 94);
});

test('seasonal peak, sustained growth, and stockout imputation change the result', () => {
  const seasonal = fixture({historyStart: '2024-01-01', asOf: '2026-07-01',
    daily: date => Number(date.slice(5, 7)) >= 5 && Number(date.slice(5, 7)) <= 8 ? 20 : 5});
  const peak = calculate(seasonal);
  const off = calculate(fixture({historyStart: '2024-01-01', asOf: '2026-01-01',
    daily: date => Number(date.slice(5, 7)) >= 5 && Number(date.slice(5, 7)) <= 8 ? 20 : 5}));
  assert.ok(peak.lines[0]!.metrics.seasonFactor > off.lines[0]!.metrics.seasonFactor);
  assert.ok(peak.lines[0]!.recommendedQty > off.lines[0]!.recommendedQty);
  const rising = calculate(fixture({asOf: '2026-01-29', daily: date => date >= '2025-12-04' ?
    5 + Math.floor((Date.parse(`${date}T00:00:00Z`) - Date.parse('2025-12-04T00:00:00Z')) / (7 * dayMs)) : 5}));
  const flat = calculate(fixture({asOf: '2026-01-29', daily: () => 5}));
  assert.ok(rising.lines[0]!.metrics.trendFactor > 1);
  assert.ok(rising.lines[0]!.recommendedQty > flat.lines[0]!.recommendedQty);
  const stockout = calculate(fixture({daily: date => date >= '2025-12-12' ? 0 : 10,
    stockouts: [{sku: 'SKU', warehouseId: 'WH', start: '2025-12-12', end: '2025-12-31'}]}));
  assert.ok(stockout.lines[0]!.metrics.lostDemandUnits > 0);
  assert.ok(stockout.lines[0]!.recommendedQty > stockout.lines[0]!.metrics.rawSalesQty);
});

test('same-customer/day spike is hard-excluded and recurrent event needs guarded specialist evidence', () => {
  const spike = fixture({extraSales: [500, 500].map((quantity, index) => ({id: `spike_${index}`, date: '2025-12-20',
    sku: 'SKU', warehouseId: 'WH', quantity, customerToken: 'anon_aaaaaaaaaaaaaaaa', unitPrice: 2}))});
  const inspected = inspectDemand(scope(spike));
  const hard = inspected.inspection.candidates.find(candidate => candidate.quantity === 1000);
  assert.ok(hard?.hardOneOff);
  const result = calculateDemand(scope(spike), inspected, null);
  assert.deepEqual(result.eventActions.find(action => action.eventId === hard.eventId),
    {eventId: hard.eventId, action: 'exclude', source: 'hard_rule'});
  assert.ok(Math.abs(result.lines[0]!.recommendedQty - calculate(fixture()).lines[0]!.recommendedQty) <= 4);
  const repeatedDates = ['2025-09-29', '2025-10-20', '2025-11-12', '2025-12-05'];
  const recurrent = fixture({extraSales: repeatedDates.map((date, index) => ({id: `repeat_${index}`, date,
    sku: 'SKU', warehouseId: 'WH', quantity: 70, customerToken: 'anon_bbbbbbbbbbbbbbbb', unitPrice: 1}))});
  const recurringInspection = inspectDemand(scope(recurrent));
  const fourth = recurringInspection.inspection.candidates.find(candidate => candidate.date === '2025-12-05' && candidate.quantity === 70);
  assert.equal(fourth?.recurrenceCount, 3);
  assert.equal(fourth?.hardOneOff, false);
  const provisional = calculateDemand(scope(recurrent), recurringInspection, null);
  assert.equal(provisional.eventActions.find(action => action.eventId === fourth.eventId)?.action, 'exclude_pending_review');
  assert.ok(provisional.lines[0]!.warnings.some(item => item.code === 'ANOMALY_REVIEW'));
  const guarded: SpecialistReport = {decisions: recurringInspection.inspection.candidates.map(candidate => ({
    eventId: candidate.eventId, label: candidate.eventId === fourth.eventId ? 'recurring' : 'one_off',
    confidence: 0.9, evidenceCodes: candidate.eventId === fourth.eventId ? ['REPEATED_PURCHASES'] : []
  }))};
  const retained = calculateDemand(scope(recurrent), recurringInspection, guarded);
  assert.equal(retained.eventActions.find(action => action.eventId === fourth.eventId)?.action, 'retain');
  assert.ok(retained.lines[0]!.recommendedQty > provisional.lines[0]!.recommendedQty);
});

test('rolling median and MAD match a varied 90-day history', () => {
  const input = fixture({daily: (_date, index) => index % 5 + 1,
    extraSales: [{id: 'varied_spike', date: '2025-12-20', sku: 'SKU', warehouseId: 'WH',
      quantity: 100, customerToken: 'anon_cccccccccccccccc', unitPrice: 1}]});
  const candidate = inspectDemand(scope(input)).inspection.candidates.find(item => item.quantity === 100);
  assert.equal(candidate?.priorObservationCount, 90);
  assert.equal(candidate?.medianQuantity, 3);
  assert.equal(candidate?.madQuantity, 1);
});

test('critical missing stock and candidate overflow fail explicitly', () => {
  const noStock = fixture(); noStock.stock = [];
  assert.throws(() => calculate(noStock), (error: unknown) => error instanceof CalculationError && error.code === 'DATA_GAP');
  const events = Array.from({length: 25}, (_, index) => ({id: `large_${index}`, date: new Date(Date.parse('2025-11-01T00:00:00Z') + index * dayMs).toISOString().slice(0, 10),
    sku: 'SKU', warehouseId: 'WH', quantity: 1000, customerToken: `anon_${(index + 1000).toString(16).padStart(16, '0')}`, unitPrice: 1}));
  assert.throws(() => inspectDemand(scope(fixture({extraSales: events}))),
    (error: unknown) => error instanceof CalculationError && error.code === 'CANDIDATE_LIMIT');
});

test('run-scoped DB tool factory reads the immutable snapshot and caches its calculation', async () => {
  loadRepositoryEnv();
  const db = createDb();
  let datasetId: string;
  try { datasetId = (await db.createDataset(buildSyntheticDataset(), 'synthetic_24_month_v4')).id; }
  finally { await db.close(); }
  const {scopeId, tools, lookupCalculation} = await createDemandTools({datasetId, warehouseId: 'WH_DEMO',
    categoryId: 'CAT_STABLE', runId: 'run_test_b05'});
  const signal = new AbortController().signal;
  const inspected = await tools.inspect({signal});
  assert.equal(inspected.ok, true);
  if (!inspected.ok) return;
  assert.equal(inspected.value.scopeId, scopeId);
  assert.equal(inspected.value.itemCount, 1);
  const calculated = await tools.calculate({specialist: null}, {signal});
  assert.equal(calculated.ok, true);
  if (!calculated.ok) return;
  assert.equal(calculated.value.lines.length, 1);
  assert.deepEqual(lookupCalculation(calculated.value.calculationId), calculated.value);
  assert.equal(lookupCalculation('other_calculation'), null);
  const again = await tools.calculate({specialist: null}, {signal});
  assert.deepEqual(again, calculated);
});

test('near-limit sales and stockout intervals finish within the tool budget', () => {
  const extraSales: DatasetInput['sales'] = [];
  for (let index = 0; index < 19_000; index++) {
    const date = new Date(Date.parse('2025-01-01T00:00:00Z') + Math.floor(index / 60) * dayMs).toISOString().slice(0, 10);
    extraSales.push({id: `dense_${index}`, date, sku: 'SKU', warehouseId: 'WH', quantity: 10,
      customerToken: `anon_${(index + 50_000).toString(16).padStart(16, '0')}`, unitPrice: 1});
  }
  const input = fixture({extraSales, daily: date => date >= '2025-12-01' ? 0 : 10,
    stockouts: Array.from({length: 1_000}, () =>
    ({sku: 'SKU', warehouseId: 'WH', start: '2025-12-01', end: '2025-12-31'}))});
  const started = performance.now();
  const selected = scope(input);
  const inspected = inspectDemand(selected);
  const calculated = calculateDemand(selected, inspected, null);
  const elapsedMs = performance.now() - started;
  assert.equal(inspected.inspection.candidateCount, 0);
  assert.ok(calculated.lines[0]!.metrics.lostDemandUnits > 0);
  assert.ok(elapsedMs < 15_000, `Max-input calculation took ${Math.round(elapsedMs)} ms`);
});
