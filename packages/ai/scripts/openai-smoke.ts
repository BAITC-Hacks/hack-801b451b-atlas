import { loadAiConfig } from '../src/config.js';
import { runOpenAiAgent } from '../src/openai/agent.js';
import type { Calculation, Inspection } from '@atlas/contracts';

const config = loadAiConfig();
if (!config.openai) {
  console.error('OpenAI smoke blocked: OPENAI_API_KEY and OPENAI_MODEL must be configured.');
  process.exitCode = 2;
} else {
  const inspection: Inspection = {
    scopeId: 'smoke-scope', candidateCount: 1,
    candidates: [{eventId: 'smoke-event', sku: 'smoke-sku', date: '2026-01-02', quantity: 60,
      medianQuantity: 5, madQuantity: 1, priorObservationCount: 4, recurrenceCount: 1,
      customerShare90d: 0.7, eventValue: 600, hardOneOff: false}],
    itemCount: 1, historyStart: '2025-01-01', asOf: '2026-01-31',
    sourceCounts: {sales: 8, stock: 1, stockouts: 0, inbound: 0, items: 1, suppliers: 1, categories: 1, growth: 1}, warnings: [],
  };
  const calculation: Calculation = {
    calculationId: 'smoke-calculation', candidates: inspection.candidates,
    eventActions: [{eventId: 'smoke-event', action: 'exclude_pending_review', source: 'degraded_rule'}],
    warnings: [{code: 'GPU_WORKLOAD_UNAVAILABLE', sku: 'smoke-sku', evidenceIds: ['smoke-event']}],
    lines: [{sku: 'smoke-sku', name: 'Synthetic smoke item', unit: 'pcs', supplierId: 'smoke-supplier', supplierName: 'Synthetic supplier',
      recommendedQty: 10, finalQty: 10, overrideReason: null, urgency: 'normal', excludedEventIds: ['smoke-event'],
      warnings: [{code: 'GPU_WORKLOAD_UNAVAILABLE', sku: 'smoke-sku', evidenceIds: ['smoke-event']}],
      metrics: {baseDaily: 1, seasonFactor: 1, trendFactor: 1, plannedGrowthPct: 0, leadTimeDays: 5, reviewDays: 5,
        safetyDays: 0, horizonDays: 10, forecastDaily: 1, targetUnits: 10, stock: 0, eligibleInbound: 0, laterInbound: 0,
        overdueInbound: 0, lostDemandUnits: 0, excludedUnits: 60, rawSalesQty: 70}},
    ],
  };
  const result = await runOpenAiAgent({
    runId: 'smoke-run', scopeId: inspection.scopeId, deadlineMs: Date.now() + 90_000, config: config.openai,
    inspect: async () => ({ok: true, value: inspection}),
    classify: async () => ({ok: false, error: {code: 'GPU_UNAVAILABLE'}}),
    calculate: async () => ({ok: true, value: calculation}),
  });
  const safe = {ok: result.ok, model: config.openai.model, attempts: result.attempts, elapsedMs: result.elapsedMs,
    decision: result.decision, calculationId: result.calculation?.calculationId, classification: result.classification?.status,
    errorCode: result.errorCode, trace: result.trace};
  console.log(JSON.stringify(safe));
  if (!result.ok || result.classification?.status !== 'failed' || result.calculation?.calculationId !== result.decision?.calculationId) process.exitCode = 1;
}
