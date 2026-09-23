import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function loadRepositoryEnv() {
  const rootEnv = resolve(fileURLToPath(new URL('../../../', import.meta.url)), '.env');
  try { loadEnvFile(rootEnv); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
}
