import {
  CreateDatasetResponseSchema, ListDatasetsResponseSchema, RunResponseSchema
} from '@atlas/contracts';
import { datasetHash } from '@atlas/db';
import { buildSyntheticDataset } from '../../../packages/db/src/fixture.js';
import { serverConfig } from '../src/config.js';

const {webOrigin} = serverConfig();
const base = new URL(process.env.API_SMOKE_URL || 'http://127.0.0.1:3001');
if (!['localhost', '127.0.0.1'].includes(base.hostname) || base.port !== '3001' ||
    base.protocol !== 'http:' || base.pathname !== '/') {
  throw new Error('API_SMOKE_URL must be the local API on port 3001');
}
const input = buildSyntheticDataset();

async function jsonRequest(path: string, options: RequestInit = {}, timeoutMs = 15_000): Promise<unknown> {
  const response = await fetch(new URL(path, base), {...options, signal: AbortSignal.timeout(timeoutMs)});
  const data: unknown = await response.json();
  if (!response.ok) {
    const error = data as {error?: {code?: string}};
    throw new Error(`HTTP ${response.status} ${error.error?.code ?? 'UNKNOWN'}`);
  }
  return data;
}

const listed = ListDatasetsResponseSchema.parse(await jsonRequest('/api/v1/datasets'));
let dataset = listed.datasets.find(item => item.hash === datasetHash(input));
if (!dataset) {
  dataset = CreateDatasetResponseSchema.parse(await jsonRequest('/api/v1/datasets', {
    method: 'POST', headers: {'content-type': 'application/json', origin: webOrigin},
    body: JSON.stringify(input)
  })).dataset;
}
const created = RunResponseSchema.parse(await jsonRequest('/api/v1/runs', {
  method: 'POST', headers: {'content-type': 'application/json', origin: webOrigin},
  body: JSON.stringify({datasetId: dataset.id, warehouseId: 'WH_DEMO'})
}, 110_000));
const run = created.run;
const fetched = RunResponseSchema.parse(await jsonRequest(`/api/v1/runs/${run.id}`)).run;
if (fetched.id !== run.id || fetched.revision !== 1 || fetched.status !== 'draft') {
  throw new Error('Persisted run did not match the live HTTP response');
}
const [openai, gpu] = run.ai.runtimes;
const toolNames = run.ai.trace.filter(event => event.kind === 'tool').map(event => event.name);
if (openai?.status !== 'success' || !toolNames.includes('inspectDemand') ||
    !toolNames.includes('classifyEvents') || !toolNames.includes('calculateOrders')) {
  throw new Error(`OpenAI tool loop did not complete: ${openai?.status ?? 'missing'}; ${toolNames.join(',')}`);
}
console.log(JSON.stringify({runId: run.id, datasetId: dataset.id, mode: run.mode,
  openai: {status: openai.status, model: openai.model, attempts: openai.attempts},
  brev_gpu: {status: gpu?.status, errorCode: gpu?.errorCode, skipReason: gpu?.skipReason},
  tools: toolNames, lines: run.lines.length, revision: fetched.revision}));
