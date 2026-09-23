import assert from 'node:assert/strict';
import test from 'node:test';
import { ScriptedModel, assistantMessage, functionCall } from '@openai/agents/testing';
import type { BackendTools, Calculation, Inspection } from '@atlas/contracts';
import { runReplenishment } from '../src/run.js';

const inspection: Inspection = {
  scopeId: 'scope', candidateCount: 1,
  candidates: [{eventId: 'event', sku: 'sku', date: '2026-01-02', quantity: 40,
    medianQuantity: 5, madQuantity: 1, priorObservationCount: 20, recurrenceCount: 4,
    customerShare90d: 0.4, eventValue: 400, hardOneOff: false}],
  itemCount: 1, historyStart: '2025-01-01', asOf: '2026-01-31',
  sourceCounts: {sales: 20, stock: 1, stockouts: 0, inbound: 0, items: 1, suppliers: 1, categories: 1, growth: 1},
  warnings: [],
};
const calculation: Calculation = {
  calculationId: 'calc', candidates: inspection.candidates,
  eventActions: [{eventId: 'event', action: 'exclude_pending_review', source: 'degraded_rule'}],
  warnings: [],
  lines: [{sku: 'sku', name: 'Synthetic item', unit: 'pcs', supplierId: 'supplier', supplierName: 'Synthetic supplier',
    recommendedQty: 10, finalQty: 10, overrideReason: null, urgency: 'normal', excludedEventIds: ['event'], warnings: [],
    metrics: {baseDaily: 1, seasonFactor: 1, trendFactor: 1, plannedGrowthPct: 0, leadTimeDays: 5, reviewDays: 5,
      safetyDays: 0, horizonDays: 10, forecastDaily: 1, targetUnits: 10, stock: 0, eligibleInbound: 0,
      laterInbound: 0, overdueInbound: 0, lostDemandUnits: 0, excludedUnits: 40, rawSalesQty: 10}}],
};
const input = () => ({runId: 'run', scopeId: 'scope', deadlineMs: Date.now() + 90_000});
const unavailable = {openai: null, gpu: null, issues: []} as const;

test('missing OpenAI access invokes real deterministic callback with null specialist', async () => {
  let received: unknown = 'not called';
  const tools: BackendTools = {
    inspect: async () => ({ok: true, value: inspection}),
    calculate: async ({specialist}) => { received = specialist; return {ok: true, value: calculation}; },
  };
  const outcome = await runReplenishment(input(), tools, {config: unavailable});
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(received, null);
  assert.equal(outcome.result.mode, 'degraded');
  assert.equal(outcome.result.decision, null);
  assert.equal(outcome.result.specialist, null);
  assert.equal(outcome.result.gpuEvidence, null);
  assert.deepEqual(outcome.result.runtimes.map(runtime => [runtime.runtime, runtime.status, runtime.attempts]),
    [['openai', 'failed', 0], ['brev_gpu', 'skipped', 0]]);
  assert.ok(outcome.result.warnings.some(warning => warning.code === 'OPENAI_FAILED'));
});

test('scripted OpenAI protocol records unavailable GPU and uses null specialist', async () => {
  const model = new ScriptedModel([
    [functionCall('inspectDemand', {}, {callId: 'call-1'})],
    [functionCall('classifyEvents', {}, {callId: 'call-2'})],
    [functionCall('calculateOrders', {}, {callId: 'call-3'})],
    [assistantMessage(JSON.stringify({calculationId: 'calc', disposition: 'needs_attention', attention: [{sku: 'sku', code: 'ANOMALY_REVIEW', evidenceIds: ['event']}]}))],
  ]);
  let received: unknown = 'not called';
  const tools: BackendTools = {
    inspect: async () => ({ok: true, value: inspection}),
    calculate: async ({specialist}) => { received = specialist; return {ok: true, value: calculation}; },
  };
  const outcome = await runReplenishment(input(), tools, {
    config: {openai: {apiKey: 'test-only', model: 'scripted'}, gpu: null, issues: []},
    testModel: model,
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(received, null);
  assert.equal(outcome.result.runtimes[0]?.status, 'success');
  assert.equal(outcome.result.runtimes[1]?.status, 'failed');
  assert.equal(outcome.result.runtimes[1]?.errorCode, 'GPU_UNAVAILABLE');
  assert.equal(outcome.result.specialist, null);
  assert.equal(outcome.result.gpuEvidence, null);
  assert.equal(outcome.result.decision?.calculationId, 'calc');
  assert.ok(outcome.result.warnings.some(warning => warning.code === 'GPU_WORKLOAD_UNAVAILABLE'));
});

test('fatal backend arithmetic failure returns no result', async () => {
  const tools: BackendTools = {
    inspect: async () => ({ok: true, value: inspection}),
    calculate: async () => ({ok: false, error: {code: 'CALCULATION_FAILED', retryable: false}}),
  };
  const outcome = await runReplenishment(input(), tools, {config: unavailable});
  assert.deepEqual(outcome, {ok: false, error: {code: 'CALCULATION_FAILED'}});
});
