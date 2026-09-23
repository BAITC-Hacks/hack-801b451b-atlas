import { loadAiConfig } from '../src/config.js';
import { classifyOnGpu } from '../src/gpu/index.js';
import type { Candidate } from '@atlas/contracts';

const config = loadAiConfig();
if (!config.gpu) {
  console.error(`GPU smoke not configured: ${config.issues.filter(issue => issue.startsWith('GPU_')).join(', ')}`);
  process.exitCode = 1;
} else {
  const candidates: Candidate[] = [{
    eventId: 'smoke-recurring-1', sku: 'SKU1', date: '2026-01-01', quantity: 42,
    medianQuantity: 5, madQuantity: 1, priorObservationCount: 20,
    recurrenceCount: 4, customerShare90d: 0.4, eventValue: 420, hardOneOff: false,
  }];
  const started = Date.now();
  const result = await classifyOnGpu({ candidates }, { signal: new AbortController().signal, deadlineMs: started + 30_000 }, config.gpu);
  if (!result.ok) {
    console.error(JSON.stringify({ status: 'failed', code: result.error.code, elapsedMs: Date.now() - started }));
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify({
      status: 'validated', modelId: result.evidence.modelId,
      deploymentId: result.evidence.deploymentId, inferenceResponseId: result.evidence.inferenceResponseId,
      requestStartedAt: result.evidence.requestStartedAt, requestFinishedAt: result.evidence.requestFinishedAt,
      elapsedMs: Date.now() - started, decisions: result.report.decisions,
    }));
  }
}
