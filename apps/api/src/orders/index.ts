import {
  ApproveRunBodySchema, ChangeLinesBodySchema, ExportQuerySchema,
  type Run
} from '@atlas/contracts';
import {
  NotFoundError, RevisionConflictError, RunLockedError,
  type Db
} from '@atlas/db';

export class OrderInputError extends Error { constructor() { super('VALIDATION_ERROR'); } }
export class ReviewRequiredError extends Error { constructor() { super('REVIEW_REQUIRED'); } }

async function currentDraft(db: Db, runId: string, expectedRevision: number): Promise<Run> {
  const run = await db.getRun(runId);
  if (!run) throw new NotFoundError();
  if (run.status !== 'draft') throw new RunLockedError();
  if (run.revision !== expectedRevision) throw new RevisionConflictError();
  return run;
}

export async function editRun(db: Db, runId: string, value: unknown, actor: string): Promise<Run> {
  const body = ChangeLinesBodySchema.parse(value);
  const run = await currentDraft(db, runId, body.expectedRevision);
  const changes = new Map(body.changes.map(change => [change.sku, change]));
  if (body.changes.some(change => !run.lines.some(line => line.sku === change.sku))) throw new OrderInputError();
  const next = {...run, revision: run.revision + 1,
    lines: run.lines.map(line => {
      const change = changes.get(line.sku);
      return change ? {...line, finalQty: change.finalQty, overrideReason: change.overrideReason} : line;
    })};
  return db.reviseRun(runId, body.expectedRevision, next, actor, 'edit', {changedSkus: body.changes.map(change => change.sku)});
}

export async function approveRun(db: Db, runId: string, value: unknown, actor: string): Promise<Run> {
  const body = ApproveRunBodySchema.parse(value);
  const run = await currentDraft(db, runId, body.expectedRevision);
  const needsReview = run.warnings.length > 0 || run.lines.some(line => line.warnings.length > 0) ||
    run.ai.decision?.disposition === 'needs_attention';
  if (needsReview && !body.acknowledgeWarnings) throw new ReviewRequiredError();
  const next = {...run, status: 'approved' as const, revision: run.revision + 1,
    approvedAt: new Date().toISOString(), approvedBy: actor};
  return db.reviseRun(runId, body.expectedRevision, next, actor, 'approve',
    {acknowledgedWarnings: body.acknowledgeWarnings});
}

function csvField(value: string | number): string {
  const string = String(value);
  const protectedValue = /^[\u0000-\u001f]/u.test(string) || /^\s*[=+\-@]/u.test(string)
    ? `'${string}` : string;
  return `"${protectedValue.replaceAll('"', '""')}"`;
}

function explanation(line: Run['lines'][number], locale: 'ru' | 'en'): string {
  const metrics = line.metrics;
  if (locale === 'ru') {
    return `Рекомендовано ${line.recommendedQty}; утверждено ${line.finalQty}; спрос ${metrics.baseDaily}/день; сезонный коэффициент ${metrics.seasonFactor}; тренд ${metrics.trendFactor}; рост ${metrics.plannedGrowthPct}%; запас ${metrics.stock}; ожидаемые поставки ${metrics.eligibleInbound}; компенсация дефицита ${metrics.lostDemandUnits}; исключено ${metrics.excludedUnits}.`;
  }
  return `Recommended ${line.recommendedQty}; approved ${line.finalQty}; demand ${metrics.baseDaily}/day; season factor ${metrics.seasonFactor}; trend ${metrics.trendFactor}; growth ${metrics.plannedGrowthPct}%; stock ${metrics.stock}; eligible inbound ${metrics.eligibleInbound}; stockout correction ${metrics.lostDemandUnits}; excluded ${metrics.excludedUnits}.`;
}

export async function exportRun(db: Db, runId: string, value: unknown): Promise<string> {
  const query = ExportQuerySchema.parse(value);
  const run = await db.getRun(runId);
  if (!run) throw new NotFoundError();
  if (run.status !== 'approved') throw new RunLockedError();
  if (run.revision !== query.revision) throw new RevisionConflictError();
  const header = ['warehouse_code', 'sku', 'supplier_code', 'unit', 'recommended_qty',
    'approved_qty', 'urgency', 'explanation'];
  const rows = [header, ...run.lines.filter(line => line.finalQty > 0)
    .sort((a, b) => a.supplierId.localeCompare(b.supplierId) || a.sku.localeCompare(b.sku))
    .map(line => [run.warehouseId, line.sku, line.supplierId, line.unit, line.recommendedQty,
      line.finalQty, line.urgency, explanation(line, query.locale)])];
  return `\uFEFF${rows.map(row => row.map(csvField).join(';')).join('\r\n')}\r\n`;
}
