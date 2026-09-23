import { bigint, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import type { DatasetInput, Run } from '@atlas/contracts';

export const datasets = pgTable('datasets', {
  id: uuid('id').primaryKey().defaultRandom(),
  label: varchar('label', { length: 120 }).notNull(),
  kind: varchar('kind', { length: 16 }).notNull(),
  hash: varchar('hash', { length: 64 }).notNull(),
  seedKey: varchar('seed_key', { length: 80 }),
  input: jsonb('input').$type<DatasetInput>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, table => [uniqueIndex('datasets_seed_key_uq').on(table.seedKey), index('datasets_created_at_idx').on(table.createdAt)]);

export const runs = pgTable('runs', {
  id: uuid('id').primaryKey(),
  datasetId: uuid('dataset_id').notNull().references(() => datasets.id),
  datasetHash: varchar('dataset_hash', { length: 64 }).notNull(),
  warehouseId: varchar('warehouse_id', { length: 80 }).notNull(),
  categoryId: varchar('category_id', { length: 80 }),
  status: varchar('status', { length: 16 }).notNull(),
  revision: integer('revision').notNull(),
  run: jsonb('run').$type<Run>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, table => [index('runs_dataset_id_idx').on(table.datasetId)]);

export const runLines = pgTable('run_lines', {
  runId: uuid('run_id').notNull().references(() => runs.id),
  sku: varchar('sku', { length: 48 }).notNull(),
  supplierId: varchar('supplier_id', { length: 80 }).notNull(),
  recommendedQty: integer('recommended_qty').notNull(),
  finalQty: integer('final_qty').notNull(),
  overrideReason: text('override_reason')
}, table => [uniqueIndex('run_lines_run_sku_uq').on(table.runId, table.sku)]);

export const runAudit = pgTable('run_audit', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  runId: uuid('run_id').notNull().references(() => runs.id),
  revision: integer('revision').notNull(),
  action: varchar('action', { length: 16 }).notNull(),
  actor: text('actor').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  details: jsonb('details').$type<{ changedSkus?: string[]; acknowledgedWarnings?: boolean }>().notNull()
}, table => [uniqueIndex('run_audit_run_revision_uq').on(table.runId, table.revision)]);
