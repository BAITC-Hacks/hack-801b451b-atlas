import { createDb } from '../src/index.js';
import { buildSyntheticDataset } from '../src/fixture.js';
import { loadRepositoryEnv } from './env.js';

loadRepositoryEnv();
const db = createDb();
try {
  const dataset = await db.createDataset(buildSyntheticDataset(), 'synthetic_24_month_v4');
  process.stdout.write(`Synthetic dataset ID: ${dataset.id}\n`);
} finally { await db.close(); }
