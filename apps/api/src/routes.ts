import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Db } from '@atlas/db';
import { runReplenishment } from '@atlas/ai';
import { NotFoundError, RevisionConflictError, RunLockedError } from '@atlas/db';
import { AiOutcomeSchema, CreateRunBodySchema, DatasetInputSchema, ErrorSchema,
  RunIdParamsSchema, type ErrorCode } from '@atlas/contracts';
import { CalculationError } from './calculation/index.js';
import { approveRun, editRun, exportRun, OrderInputError, ReviewRequiredError } from './orders/index.js';
import { assembleDraft } from './runs/assemble.js';
import { createDemandTools } from './tools/index.js';
import { serverConfig } from './config.js';

function sendError(reply: FastifyReply, status: number, code: ErrorCode, issues?: {path: string; code: string}[]) {
  const payload = ErrorSchema.parse({error: {code, requestId: randomUUID(), ...(issues ? {issues} : {})}});
  return reply.status(status).send(payload);
}

function sendOrderError(reply: FastifyReply, error: unknown) {
  if (error instanceof ZodError || error instanceof OrderInputError) return sendError(reply, 400, 'VALIDATION_ERROR');
  if (error instanceof NotFoundError) return sendError(reply, 404, 'NOT_FOUND');
  if (error instanceof RevisionConflictError) return sendError(reply, 409, 'REVISION_CONFLICT');
  if (error instanceof RunLockedError) return sendError(reply, 409, 'RUN_LOCKED');
  if (error instanceof ReviewRequiredError) return sendError(reply, 422, 'REVIEW_REQUIRED');
  return sendError(reply, 503, 'DB_UNAVAILABLE');
}

export function registerRoutes(app: FastifyInstance, db: Db): void {
  const {webOrigin, demoOperator} = serverConfig();
  app.addHook('onRequest', async (request, reply) => {
    if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') return;
    if (request.headers.origin !== webOrigin) { sendError(reply, 403, 'FORBIDDEN'); return; }
    if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) { sendError(reply, 400, 'VALIDATION_ERROR'); return; }
  });
  app.setErrorHandler((error, _request, reply) => {
    const httpError = error as {code?: string; statusCode?: number};
    if (httpError.code === 'FST_ERR_CTP_BODY_TOO_LARGE') { sendError(reply, 413, 'PAYLOAD_TOO_LARGE'); return; }
    if (httpError.statusCode === 400) { sendError(reply, 400, 'VALIDATION_ERROR'); return; }
    sendError(reply, 500, 'INTERNAL_ERROR');
  });

  app.get('/api/v1/health', async (_request, reply) => {
    try { await db.health(); return {status: 'ok', database: 'ok'}; }
    catch { return sendError(reply, 503, 'DB_UNAVAILABLE'); }
  });
  app.get('/api/v1/datasets', async (_request, reply) => {
    try { return {datasets: await db.listDatasets()}; }
    catch { return sendError(reply, 503, 'DB_UNAVAILABLE'); }
  });
  app.post('/api/v1/datasets', async (request: FastifyRequest, reply) => {
    const parsed = DatasetInputSchema.safeParse(request.body);
    if (!parsed.success) {
      const issues = parsed.error.issues.slice(0, 32).map(issue => ({path: issue.path.join('.'), code: issue.code}));
      return sendError(reply, 400, 'VALIDATION_ERROR', issues);
    }
    try {
      const dataset = await db.createDataset(parsed.data);
      return reply.status(201).send({dataset});
    } catch (error) {
      if (error instanceof ZodError) return sendError(reply, 400, 'VALIDATION_ERROR');
      return sendError(reply, 503, 'DB_UNAVAILABLE');
    }
  });

  app.get('/api/v1/runs/:runId', async (request: FastifyRequest, reply) => {
    const params = RunIdParamsSchema.safeParse(request.params);
    if (!params.success) return sendError(reply, 400, 'VALIDATION_ERROR');
    try {
      const run = await db.getRun(params.data.runId);
      return run ? {run} : sendError(reply, 404, 'NOT_FOUND');
    } catch { return sendError(reply, 503, 'DB_UNAVAILABLE'); }
  });

  app.post('/api/v1/runs', async (request: FastifyRequest, reply) => {
    const parsed = CreateRunBodySchema.safeParse(request.body);
    if (!parsed.success) return sendError(reply, 400, 'VALIDATION_ERROR',
      parsed.error.issues.slice(0, 32).map(issue => ({path: issue.path.join('.'), code: issue.code})));
    const {datasetId, warehouseId, categoryId} = parsed.data;
    let dataset: Awaited<ReturnType<Db['getDataset']>>;
    try { dataset = await db.getDataset(datasetId); }
    catch { return sendError(reply, 503, 'DB_UNAVAILABLE'); }
    if (!dataset) return sendError(reply, 404, 'NOT_FOUND');
    if (!dataset.input.warehouses.some(item => item.id === warehouseId) ||
        (categoryId !== undefined && !dataset.input.categories.some(item => item.id === categoryId)) ||
        !dataset.input.items.some(item => categoryId === undefined || item.categoryId === categoryId)) {
      return sendError(reply, 400, 'VALIDATION_ERROR');
    }
    const runId = db.newRunId();
    let scope: Awaited<ReturnType<typeof createDemandTools>>;
    try { scope = await createDemandTools({datasetId, warehouseId, categoryId, runId}); }
    catch (error) {
      if (error instanceof CalculationError) return sendError(reply, 422, error.code);
      return sendError(reply, 503, 'DB_UNAVAILABLE');
    }
    let outcome: ReturnType<typeof AiOutcomeSchema.parse>;
    try { outcome = AiOutcomeSchema.parse(await runReplenishment({runId, scopeId: scope.scopeId,
      deadlineMs: Date.now() + 90_000}, scope.tools)); }
    catch { return sendError(reply, 503, 'CALCULATION_FAILED'); }
    if (!outcome.ok) {
      const status = outcome.error.code === 'DEADLINE_EXCEEDED' ? 504
        : outcome.error.code === 'CALCULATION_FAILED' ? 503 : 422;
      return sendError(reply, status, outcome.error.code);
    }
    const calculation = scope.lookupCalculation(outcome.result.calculationId);
    if (!calculation) return sendError(reply, 503, 'CALCULATION_FAILED');
    let run;
    try { run = assembleDraft({runId, dataset: dataset.summary, warehouseId,
      categoryId: categoryId ?? null, ai: outcome.result, calculation}); }
    catch { return sendError(reply, 503, 'CALCULATION_FAILED'); }
    try { await db.createRun(run, demoOperator); }
    catch { return sendError(reply, 503, 'DB_UNAVAILABLE'); }
    return reply.status(201).send({run});
  });

  app.patch('/api/v1/runs/:runId/lines', async (request: FastifyRequest, reply) => {
    const params = RunIdParamsSchema.safeParse(request.params);
    if (!params.success) return sendError(reply, 400, 'VALIDATION_ERROR');
    try { return {run: await editRun(db, params.data.runId, request.body, demoOperator)}; }
    catch (error) { return sendOrderError(reply, error); }
  });

  app.post('/api/v1/runs/:runId/approve', async (request: FastifyRequest, reply) => {
    const params = RunIdParamsSchema.safeParse(request.params);
    if (!params.success) return sendError(reply, 400, 'VALIDATION_ERROR');
    try { return {run: await approveRun(db, params.data.runId, request.body, demoOperator)}; }
    catch (error) { return sendOrderError(reply, error); }
  });

  app.get('/api/v1/runs/:runId/export', async (request: FastifyRequest, reply) => {
    const params = RunIdParamsSchema.safeParse(request.params);
    if (!params.success) return sendError(reply, 400, 'VALIDATION_ERROR');
    try {
      const csv = await exportRun(db, params.data.runId, request.query);
      return reply.header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="order-${params.data.runId}.csv"`)
        .header('Cache-Control', 'no-store').send(csv);
    } catch (error) { return sendOrderError(reply, error); }
  });
}
