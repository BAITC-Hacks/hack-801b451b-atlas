import Fastify from 'fastify';
import type { Db } from '@atlas/db';
import { registerRoutes } from './routes.js';

export function buildApp(db: Db) {
  const app = Fastify({bodyLimit: 5 * 1024 * 1024, logger: false});
  registerRoutes(app, db);
  return app;
}
