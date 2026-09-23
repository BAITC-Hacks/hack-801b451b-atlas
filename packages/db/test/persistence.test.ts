import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createDb, RevisionConflictError, RunLockedError } from '../src/index.js';
import { buildSyntheticDataset } from '../src/fixture.js';
import { loadRepositoryEnv } from '../scripts/env.js';
import { runLines } from '../src/schema.js';
import { eq } from 'drizzle-orm';

loadRepositoryEnv();

test('seed idempotency, immutable snapshot, draft reload, revision and approval audit', async () => {
  const db = createDb();
  try {
    const fixture = buildSyntheticDataset();
    assert.equal(fixture.items.length, 6);
    assert.equal(fixture.sales.length, 1216);
    assert.equal(fixture.warehouses.length, 1);
    assert.equal(fixture.categories.length, 2);
    assert.equal(fixture.suppliers.length, 2);
    const prior90 = fixture.sales.filter(sale => sale.sku === 'SPIKE' && sale.quantity > 0 &&
      sale.date < '2025-09-20' && sale.date >= '2025-06-22');
    assert.ok(prior90.length >= 8);
    const recurring = fixture.sales.filter(sale => sale.sku === 'BORDERLINE' && sale.customerToken === 'anon_0000000000000385' &&
      sale.date >= '2025-08-24' && sale.date < '2025-11-22');
    assert.equal(recurring.length, 3);
    assert.ok(fixture.sales.some(sale => sale.sku === 'STOCKOUT' && sale.date === '2025-09-15' && sale.quantity === 0));
    assert.equal(fixture.sales.filter(sale => sale.sku === 'STOCKOUT' && sale.date >= '2025-07-07' &&
      sale.date < '2025-09-01' && sale.quantity > 0).length, 56);
    assert.ok(fixture.sales.find(sale => sale.sku === 'GROWING' && sale.date === '2025-12-15')!.quantity >
      fixture.sales.find(sale => sale.sku === 'GROWING' && sale.date === '2025-11-15')!.quantity);
    const seedKey = `test_${randomUUID()}`;
    const first = await db.createDataset(fixture, seedKey);
    const second = await db.createDataset(fixture, seedKey);
    assert.equal(first.id, second.id);
    assert.equal(first.hash, second.hash);
    const stored = await db.getDataset(first.id);
    assert.deepEqual(stored?.input, fixture);
    assert.equal(stored?.summary.saleCount, 1216);
    const runId = db.newRunId();
    const now = new Date().toISOString();
    const run = {
      id: runId, datasetId: first.id, datasetHash: first.hash, warehouseId: 'WH_DEMO', categoryId: 'CAT_STABLE',
      asOf: fixture.asOf, algorithmVersion: 'replenishment-v1', status: 'draft', mode: 'degraded', revision: 1,
      lines: [{sku: 'STABLE', name: 'Stable relay', unit: 'pcs', supplierId: 'SUP_A', supplierName: 'Supplier A',
        recommendedQty: 12, finalQty: 12, overrideReason: null, urgency: 'normal',
        metrics: {baseDaily: 1, seasonFactor: 1, trendFactor: 1, plannedGrowthPct: 0, leadTimeDays: 14,
          reviewDays: 14, safetyDays: 7, horizonDays: 35, forecastDaily: 1, targetUnits: 35,
          stock: 6, eligibleInbound: 5, laterInbound: 0, overdueInbound: 0, lostDemandUnits: 0,
          excludedUnits: 0, rawSalesQty: 12}, excludedEventIds: [], warnings: []}],
      warnings: [],
      ai: {mode: 'degraded', calculationId: 'calculation_test', decision: null, specialist: null, candidates: [],
        runtimes: [
          {runtime: 'openai', status: 'skipped', model: null, attempts: 0, elapsedMs: 0, errorCode: null, skipReason: 'not_reached'},
          {runtime: 'brev_gpu', status: 'skipped', model: null, attempts: 0, elapsedMs: 0, errorCode: null, skipReason: 'no_candidates'}
        ], gpuEvidence: null, trace: [], warnings: [], eventActions: []},
      approvedAt: null, approvedBy: null, createdAt: now
    } as const;
    await db.createRun(run, 'persistence-test');
    assert.deepEqual(await db.getRun(runId), run);
    const edited = {...run, revision: 2, lines: [{...run.lines[0]!, finalQty: 10, overrideReason: 'Local review adjustment'}]};
    await db.reviseRun(runId, 1, edited, 'persistence-test', 'edit', {changedSkus: ['STABLE']});
    const storedLine = await db.client.select().from(runLines).where(eq(runLines.runId, runId));
    assert.equal(storedLine[0]?.recommendedQty, 12);
    assert.equal(storedLine[0]?.finalQty, 10);
    assert.equal(storedLine[0]?.overrideReason, 'Local review adjustment');
    await assert.rejects(db.reviseRun(runId, 1, edited, 'persistence-test', 'edit'), RevisionConflictError);
    const approved = {...edited, revision: 3, status: 'approved', approvedAt: now, approvedBy: 'persistence-test'};
    await db.reviseRun(runId, 2, approved, 'persistence-test', 'approve', {acknowledgedWarnings: false});
    assert.deepEqual(await db.getRun(runId), approved);
    await assert.rejects(db.reviseRun(runId, 3, approved, 'persistence-test', 'approve'), RunLockedError);
    assert.deepEqual((await db.getRunAudit(runId)).map(row => [row.action, row.revision, row.actor]),
      [['create', 1, 'persistence-test'], ['edit', 2, 'persistence-test'], ['approve', 3, 'persistence-test']]);
  } finally { await db.close(); }
});
