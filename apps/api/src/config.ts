import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function loadRepositoryEnv(): void {
  const rootEnv = resolve(fileURLToPath(new URL('../../../', import.meta.url)), '.env');
  try { loadEnvFile(rootEnv); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
}

export function serverConfig() {
  loadRepositoryEnv();
  return {
    webOrigin: process.env.WEB_ORIGIN || 'http://localhost:3000',
    port: 3001,
    demoOperator: process.env.DEMO_OPERATOR || 'Local demo operator'
  };
}
