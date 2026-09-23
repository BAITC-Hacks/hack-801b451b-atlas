import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Db } from '@atlas/db';
import { DatasetInputSchema, ErrorSchema } from '@atlas/contracts';
import { serverConfig } from './config.js';

type ErrorCode = 'VALIDATION_ERROR' | 'PAYLOAD_TOO_LARGE' | 'DB_UNAVAILABLE' | 'FORBIDDEN' | 'INTERNAL_ERROR';

function sendError(reply: FastifyReply, status: number, code: ErrorCode, issues?: {path: string; code: string}[]) {
  const payload = ErrorSchema.parse({error: {code, requestId: randomUUID(), ...(issues ? {issues} : {})}});
  return reply.status(status).send(payload);
}

export function registerRoutes(app: FastifyInstance, db: Db): void {
  const {webOrigin} = serverConfig();
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
}
