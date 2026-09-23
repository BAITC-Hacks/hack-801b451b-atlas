import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatasetSummarySchema, QuoteRunResponseSchema, RunSchema, type Run } from '@atlas/contracts';
import { datasetHash, type Db } from '@atlas/db';
import { buildSyntheticDataset } from '@atlas/db/fixture';
import { buildApp } from '../src/app.js';

const headers = {origin: 'http://localhost:3000', 'content-type': 'application/json'};
const metrics: Run['lines'][number]['metrics'] = {
  baseDaily: 1, seasonFactor: 1, trendFactor: 1, plannedGrowthPct: 0,
  leadTimeDays: 1, reviewDays: 1, safetyDays: 0, horizonDays: 2,
  forecastDaily: 1, targetUnits: 2, stock: 0, eligibleInbound: 0,
  laterInbound: 0, overdueInbound: 0, lostDemandUnits: 0, excludedUnits: 0, rawSalesQty: 2
};

function fixture() {
  const input = buildSyntheticDataset();
  const hash = datasetHash(input);
  const dataset = {
    summary: DatasetSummarySchema.parse({id: 'dataset-1', label: input.label, kind: input.kind,
      asOf: input.asOf, historyStart: input.historyStart, hash,
      warehouses: input.warehouses, categories: input.categories.map(({id, name}) => ({id, name})),
      itemCount: input.items.length, saleCount: input.sales.length}),
    input
  };
  const run = RunSchema.parse({
    id: 'run-1', datasetId: dataset.summary.id, datasetHash: hash,
    warehouseId: 'WH_DEMO', categoryId: null, asOf: input.asOf,
    algorithmVersion: 'replenishment-v1', status: 'draft', mode: 'degraded', revision: 2,
    lines: [
      {sku: 'STABLE', name: 'Stable relay', unit: 'pcs', supplierId: 'SUP_A', supplierName: 'Supplier A',
        recommendedQty: 3, finalQty: 3, overrideReason: null, urgency: 'normal', metrics, excludedEventIds: [], warnings: []},
      {sku: 'SEASONAL', name: 'Seasonal cable', unit: 'pcs', supplierId: 'SUP_A', supplierName: 'Supplier A',
        recommendedQty: 0, finalQty: 0, overrideReason: null, urgency: 'none', metrics, excludedEventIds: [], warnings: []}
    ], warnings: [], ai: {mode: 'degraded', calculationId: 'calc-1', decision: null, specialist: null,
      candidates: [], runtimes: [
        {runtime: 'openai', status: 'failed', model: null, attempts: 0, elapsedMs: 0, errorCode: 'AUTH', skipReason: null},
        {runtime: 'brev_gpu', status: 'skipped', model: null, attempts: 0, elapsedMs: 0, errorCode: null, skipReason: 'not_reached'}
      ], gpuEvidence: null, trace: [], warnings: [], eventActions: []},
    approvedAt: null, approvedBy: null, createdAt: '2026-01-01T00:00:00.000Z'
  });
  const db = {
    getRun: async (id: string) => id === run.id ? run : null,
    getDataset: async (id: string) => id === dataset.summary.id ? dataset : null
  } as unknown as Db;
  return {app: buildApp(db), run, dataset};
}

function quote(app: ReturnType<typeof buildApp>, payload: Record<string, unknown>) {
  return app.inject({method: 'POST', url: '/api/v1/runs/run-1/quote', headers, payload});
}

test('ordinary order total uses operator purchase price and dataset currency', async () => {
  const {app} = fixture();
  try {
    const response = await quote(app, {expectedRevision: 2, prices: [{sku: 'STABLE', unitPriceMinor: 125}]});
    assert.equal(response.statusCode, 200, response.body);
    const {quote: result} = QuoteRunResponseSchema.parse(response.json());
    assert.equal(result.currency, 'KZT');
    assert.equal(result.revision, 2);
    assert.equal(result.totalMinor, 375);
    assert.deepEqual(result.lines.map(line => [line.sku, line.lineTotalMinor]), [['STABLE', 375], ['SEASONAL', 0]]);
    assert.equal(result.budgetMinor, null);
    assert.equal(result.withinBudget, null);
    assert.equal(response.headers['cache-control'], 'no-store');
  } finally { await app.close(); }
});

test('over-budget quote reports overage and a larger budget reports remaining', async () => {
  const {app} = fixture();
  try {
    const body = {expectedRevision: 2, prices: [{sku: 'STABLE', unitPriceMinor: 125}]};
    const over = QuoteRunResponseSchema.parse((await quote(app, {...body, budgetMinor: 300})).json()).quote;
    assert.deepEqual([over.totalMinor, over.budgetMinor, over.remainingMinor, over.overageMinor, over.withinBudget],
      [375, 300, 0, 75, false]);
    const under = QuoteRunResponseSchema.parse((await quote(app, {...body, budgetMinor: 500})).json()).quote;
    assert.deepEqual([under.remainingMinor, under.overageMinor, under.withinBudget], [125, 0, true]);
  } finally { await app.close(); }
});

test('zero-quantity lines contribute zero with or without a supplied price', async () => {
  const {app} = fixture();
  try {
    const response = await quote(app, {expectedRevision: 2, prices: [
      {sku: 'STABLE', unitPriceMinor: 0}, {sku: 'SEASONAL', unitPriceMinor: 999999}
    ], budgetMinor: 0});
    const {quote: result} = QuoteRunResponseSchema.parse(response.json());
    assert.equal(result.totalMinor, 0);
    assert.equal(result.lines[1]?.lineTotalMinor, 0);
    assert.equal(result.withinBudget, true);
  } finally { await app.close(); }
});

test('missing ordered-line price and unknown SKU are rejected', async () => {
  const {app} = fixture();
  try {
    const missing = await quote(app, {expectedRevision: 2, prices: []});
    assert.equal(missing.statusCode, 400);
    assert.equal(missing.json().error.issues[0].code, 'MISSING_ORDERED_SKU_PRICE');
    const unknown = await quote(app, {expectedRevision: 2, prices: [
      {sku: 'STABLE', unitPriceMinor: 1}, {sku: 'UNKNOWN', unitPriceMinor: 1}
    ]});
    assert.equal(unknown.statusCode, 400);
    assert.equal(unknown.json().error.issues[0].code, 'UNKNOWN_SKU');
  } finally { await app.close(); }
});

test('stale revision, currency mismatch, unsafe total and invalid price are rejected', async () => {
  const {app} = fixture();
  try {
    const stale = await quote(app, {expectedRevision: 1, prices: [{sku: 'STABLE', unitPriceMinor: 1}]});
    assert.equal(stale.statusCode, 409);
    assert.equal(stale.json().error.code, 'REVISION_CONFLICT');
    const currency = await quote(app, {expectedRevision: 2, currency: 'USD', prices: [{sku: 'STABLE', unitPriceMinor: 1}]});
    assert.equal(currency.statusCode, 400);
    assert.equal(currency.json().error.issues[0].code, 'CURRENCY_MISMATCH');
    const unsafe = await quote(app, {expectedRevision: 2, prices: [{sku: 'STABLE', unitPriceMinor: Number.MAX_SAFE_INTEGER}]});
    assert.equal(unsafe.statusCode, 400);
    assert.equal(unsafe.json().error.issues[0].code, 'UNSAFE_TOTAL');
    const invalid = await quote(app, {expectedRevision: 2, prices: [{sku: 'STABLE', unitPriceMinor: 1.5}]});
    assert.equal(invalid.statusCode, 400);
    assert.equal(invalid.json().error.code, 'VALIDATION_ERROR');
  } finally { await app.close(); }
});
