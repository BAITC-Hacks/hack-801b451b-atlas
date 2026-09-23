import { createDb } from '@atlas/db';
import { buildApp } from './app.js';
import { serverConfig } from './config.js';

const config = serverConfig();
const db = createDb();
const app = buildApp(db);
app.addHook('onClose', async () => { await db.close(); });
try { await app.listen({host: config.host, port: config.port}); }
catch (error) { console.error('API startup failed'); await app.close(); process.exitCode = 1; }
