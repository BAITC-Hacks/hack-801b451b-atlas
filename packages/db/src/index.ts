import { createHash, randomUUID } from 'node:crypto';
import { and, eq, desc } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import {
  DatasetInputSchema, DatasetSummarySchema, RunSchema,
  type DatasetInput, type DatasetSummary, type Run
} from '@atlas/contracts';
import { datasets, runAudit, runLines, runs } from './schema.js';

export class RevisionConflictError extends Error { constructor() { super('REVISION_CONFLICT'); } }
export class RunLockedError extends Error { constructor() { super('RUN_LOCKED'); } }
export class NotFoundError extends Error { constructor() { super('NOT_FOUND'); } }

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function datasetHash(input: DatasetInput): string {
  return createHash('sha256').update(canonical(DatasetInputSchema.parse(input))).digest('hex');
}

function summary(row: typeof datasets.$inferSelect): DatasetSummary {
  const input = DatasetInputSchema.parse(row.input);
  return DatasetSummarySchema.parse({
    id: row.id, label: row.label, kind: row.kind, asOf: input.asOf,
    historyStart: input.historyStart, hash: row.hash,
    warehouses: input.warehouses, categories: input.categories.map(({id, name}) => ({id, name})),
    itemCount: input.items.length, saleCount: input.sales.length
  });
}

export function createDb(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const pool = new Pool({ connectionString });
  const client = drizzle(pool, { schema: { datasets, runs, runLines, runAudit } });

  return {
    client,
    async close() { await pool.end(); },
    async health() { await pool.query('SELECT 1'); },
    async createDataset(value: unknown, seedKey?: string): Promise<DatasetSummary> {
      const input = DatasetInputSchema.parse(value);
      const hash = datasetHash(input);
      if (seedKey) {
        const existing = await client.select().from(datasets).where(eq(datasets.seedKey, seedKey)).limit(1);
        if (existing[0]) {
          if (existing[0].hash !== hash) throw new Error('Seed key already refers to different content');
          return summary(existing[0]);
        }
      }
      const inserted = await client.insert(datasets).values({label: input.label, kind: input.kind, hash, seedKey, input})
        .onConflictDoNothing({target: datasets.seedKey}).returning();
      if (inserted[0]) return summary(inserted[0]);
      if (!seedKey) throw new Error('Dataset insert failed');
      const existing = await client.select().from(datasets).where(eq(datasets.seedKey, seedKey)).limit(1);
      if (!existing[0] || existing[0].hash !== hash) throw new Error('Seed key conflict');
      return summary(existing[0]);
    },
    async listDatasets(limit = 100): Promise<DatasetSummary[]> {
      const rows = await client.select().from(datasets).orderBy(desc(datasets.createdAt), desc(datasets.id)).limit(Math.min(100, Math.max(1, limit)));
      return rows.map(summary);
    },
    async getDataset(id: string): Promise<{summary: DatasetSummary; input: DatasetInput} | null> {
      const rows = await client.select().from(datasets).where(eq(datasets.id, id)).limit(1);
      const row = rows[0];
      if (!row) return null;
      return {summary: summary(row), input: DatasetInputSchema.parse(row.input)};
    },
    async createRun(value: unknown, actor = 'system'): Promise<Run> {
      const run = RunSchema.parse(value);
      if (run.revision !== 1 || run.status !== 'draft') throw new Error('New run must be draft revision 1');
      const dataset = await this.getDataset(run.datasetId);
      if (!dataset) throw new NotFoundError();
      if (run.datasetHash !== dataset.summary.hash || run.asOf !== dataset.input.asOf ||
          !dataset.input.warehouses.some(w => w.id === run.warehouseId) ||
          (run.categoryId !== null && !dataset.input.categories.some(c => c.id === run.categoryId))) {
        throw new Error('Invalid dataset snapshot or run scope');
      }
      const scopedItems = new Map(dataset.input.items
        .filter(item => run.categoryId === null || item.categoryId === run.categoryId)
        .map(item => [item.sku, item]));
      if (new Set(run.lines.map(line => line.sku)).size !== run.lines.length ||
          run.lines.some(line => {
            const item = scopedItems.get(line.sku);
            return !item || item.supplierId !== line.supplierId || item.name !== line.name || item.unit !== line.unit;
          })) throw new Error('Order line outside immutable dataset scope');
      await client.transaction(async tx => {
        await tx.insert(runs).values({id: run.id, datasetId: run.datasetId, datasetHash: run.datasetHash,
          warehouseId: run.warehouseId, categoryId: run.categoryId, status: run.status, revision: run.revision, run});
        if (run.lines.length) await tx.insert(runLines).values(run.lines.map(line => ({runId: run.id, sku: line.sku,
          supplierId: line.supplierId, recommendedQty: line.recommendedQty, finalQty: line.finalQty,
          overrideReason: line.overrideReason})));
        await tx.insert(runAudit).values({runId: run.id, revision: 1, action: 'create', actor, details: {}});
      });
      return run;
    },
    async getRun(id: string): Promise<Run | null> {
      const rows = await client.select({run: runs.run}).from(runs).where(eq(runs.id, id)).limit(1);
      return rows[0] ? RunSchema.parse(rows[0].run) : null;
    },
    async reviseRun(id: string, expectedRevision: number, nextValue: unknown, actor: string,
      action: 'edit' | 'approve', details: {changedSkus?: string[]; acknowledgedWarnings?: boolean} = {}): Promise<Run> {
      const next = RunSchema.parse(nextValue);
      if (!actor.trim()) throw new Error('Audit actor required');
      return client.transaction(async tx => {
        const rows = await tx.select().from(runs).where(eq(runs.id, id)).for('update').limit(1);
        const row = rows[0];
        if (!row) throw new NotFoundError();
        if (row.status !== 'draft') throw new RunLockedError();
        if (row.revision !== expectedRevision) throw new RevisionConflictError();
        const previous = RunSchema.parse(row.run);
        if (next.id !== previous.id || next.datasetId !== previous.datasetId || next.datasetHash !== previous.datasetHash ||
            next.warehouseId !== previous.warehouseId || next.categoryId !== previous.categoryId || next.asOf !== previous.asOf ||
            next.createdAt !== previous.createdAt || next.algorithmVersion !== previous.algorithmVersion ||
            next.mode !== previous.mode || canonical(next.ai) !== canonical(previous.ai) ||
            canonical(next.warnings) !== canonical(previous.warnings) || next.revision !== expectedRevision + 1 ||
            next.lines.length !== previous.lines.length) throw new Error('Immutable run fields changed');
        for (let i = 0; i < next.lines.length; i++) {
          const before = previous.lines[i], after = next.lines[i];
          if (!before || !after || canonical({...before, finalQty: 0, overrideReason: null}) !== canonical({...after, finalQty: 0, overrideReason: null})) {
            throw new Error('Immutable order line fields changed');
          }
        }
        if (action === 'edit') {
          if (next.status !== 'draft' || next.approvedAt !== null || next.approvedBy !== null) throw new Error('Edit cannot approve');
        } else if (next.status !== 'approved' || next.approvedBy !== actor) throw new Error('Invalid approval audit');
        await tx.update(runs).set({status: next.status, revision: next.revision, run: next}).where(eq(runs.id, id));
        for (const line of next.lines) {
          await tx.update(runLines).set({finalQty: line.finalQty, overrideReason: line.overrideReason})
            .where(and(eq(runLines.runId, id), eq(runLines.sku, line.sku)));
        }
        await tx.insert(runAudit).values({runId: id, revision: next.revision, action, actor, details});
        return next;
      });
    },
    async getRunAudit(id: string) {
      return client.select().from(runAudit).where(eq(runAudit.runId, id)).orderBy(runAudit.revision);
    },
    newRunId() { return randomUUID(); }
  };
}

export type Db = ReturnType<typeof createDb>;
