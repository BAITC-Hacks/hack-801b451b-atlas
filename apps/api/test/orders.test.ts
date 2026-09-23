import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AiResultSchema } from '@atlas/contracts';
import { createDb, RevisionConflictError, RunLockedError } from '@atlas/db';
import { buildSyntheticDataset } from '../../../packages/db/src/fixture.js';
import { calculateDemand, inspectDemand } from '../src/calculation/index.js';
import { loadRepositoryEnv } from '../src/config.js';
import { approveRun, editRun, exportRun, ReviewRequiredError } from '../src/orders/index.js';
import { assembleDraft } from '../src/runs/assemble.js';

test('DB-backed edits, approval acknowledgment and bilingual export keep one approved revision', async () => {
  loadRepositoryEnv();
  const db = createDb();
  try {
    const input = buildSyntheticDataset();
    const dataset = await db.createDataset(input);
    const scope = {input, warehouseId: 'WH_DEMO', categoryId: 'CAT_STABLE', scopeId: 'scope_order_test'};
    const inspected = inspectDemand(scope);
    const calculation = calculateDemand(scope, inspected, null);
    const ai = AiResultSchema.parse({
      mode: 'degraded', calculationId: calculation.calculationId, decision: null,
      specialist: null, candidates: calculation.candidates, eventActions: calculation.eventActions,
      runtimes: [
        {runtime: 'openai', status: 'failed', model: 'fixture-only', attempts: 1, elapsedMs: 1, errorCode: 'NETWORK', skipReason: null},
        {runtime: 'brev_gpu', status: 'failed', model: null, attempts: 0, elapsedMs: 0, errorCode: 'GPU_UNAVAILABLE', skipReason: null}
      ], gpuEvidence: null, trace: [], warnings: []
    });
    const draft = assembleDraft({runId: db.newRunId(), dataset, warehouseId: 'WH_DEMO', categoryId: 'CAT_STABLE', ai, calculation});
    await db.createRun(draft, 'test operator');
    await assert.rejects(exportRun(db, draft.id, {locale: 'ru', revision: 1}), RunLockedError);
    const line = draft.lines[0]!;
    const edited = await editRun(db, draft.id, {expectedRevision: 1,
      changes: [{sku: line.sku, finalQty: line.recommendedQty + 3, overrideReason: 'Local test adjustment'}]}, 'test operator');
    assert.equal(edited.revision, 2);
    assert.equal(edited.lines[0]?.recommendedQty, line.recommendedQty);
    assert.equal(edited.lines[0]?.finalQty, line.recommendedQty + 3);
    await assert.rejects(editRun(db, draft.id, {expectedRevision: 1,
      changes: [{sku: line.sku, finalQty: 1, overrideReason: 'Stale'}]}, 'test operator'), RevisionConflictError);
    await assert.rejects(approveRun(db, draft.id, {expectedRevision: 2, confirm: true,
      acknowledgeWarnings: false}, 'test operator'), ReviewRequiredError);
    const approved = await approveRun(db, draft.id, {expectedRevision: 2, confirm: true,
      acknowledgeWarnings: true}, 'test operator');
    assert.equal(approved.status, 'approved');
    assert.equal(approved.revision, 3);
    assert.equal((await db.getRun(draft.id))?.approvedBy, 'test operator');
    await assert.rejects(exportRun(db, draft.id, {locale: 'en', revision: 2}), RevisionConflictError);
    const ru = await exportRun(db, draft.id, {locale: 'ru', revision: 3});
    const en = await exportRun(db, draft.id, {locale: 'en', revision: 3});
    assert.ok(ru.startsWith('\uFEFF"warehouse_code";"sku";'));
    assert.ok(ru.includes(`"${line.recommendedQty}";"${line.recommendedQty + 3}"`));
    assert.ok(ru.includes('Рекомендовано'));
    assert.ok(en.includes('Recommended'));
    assert.ok(ru.endsWith('\r\n') && en.endsWith('\r\n'));
    assert.deepEqual((await db.getRunAudit(draft.id)).map(entry => entry.action), ['create', 'edit', 'approve']);
    await assert.rejects(editRun(db, draft.id, {expectedRevision: 3,
      changes: [{sku: line.sku, finalQty: 1, overrideReason: 'After approval'}]}, 'test operator'), RunLockedError);
  } finally {
    await db.close();
  }
});
