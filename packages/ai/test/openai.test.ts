import assert from 'node:assert/strict';
import test from 'node:test';
import { ScriptedModel, assistantMessage, functionCall } from '@openai/agents/testing';
import type { Calculation, Inspection } from '@atlas/contracts';
import { runOpenAiAgent, validateAgentDecision } from '../src/openai/agent.js';

const inspection: Inspection = {
  scopeId: 'scope', candidateCount: 1,
  candidates: [{eventId: 'event', sku: 'sku', date: '2026-01-02', quantity: 60, medianQuantity: 5, madQuantity: 1,
    priorObservationCount: 4, recurrenceCount: 1, customerShare90d: 0.7, eventValue: 600, hardOneOff: false}],
  itemCount: 1, historyStart: '2025-01-01', asOf: '2026-01-31',
  sourceCounts: {sales: 8, stock: 1, stockouts: 0, inbound: 0, items: 1, suppliers: 1, categories: 1, growth: 1}, warnings: [],
};
const calculation: Calculation = {
  calculationId: 'calc', candidates: inspection.candidates,
  eventActions: [{eventId: 'event', action: 'exclude_pending_review', source: 'degraded_rule'}], warnings: [],
  lines: [{sku: 'sku', name: 'Synthetic test item', unit: 'pcs', supplierId: 'supplier', supplierName: 'Synthetic supplier',
    recommendedQty: 10, finalQty: 10, overrideReason: null, urgency: 'normal', excludedEventIds: ['event'], warnings: [],
    metrics: {baseDaily: 1, seasonFactor: 1, trendFactor: 1, plannedGrowthPct: 0, leadTimeDays: 5, reviewDays: 5,
      safetyDays: 0, horizonDays: 10, forecastDaily: 1, targetUnits: 10, stock: 0, eligibleInbound: 0,
      laterInbound: 0, overdueInbound: 0, lostDemandUnits: 0, excludedUnits: 60, rawSalesQty: 70}}],
};
const decision = {calculationId: 'calc', disposition: 'needs_attention', attention: [{sku: 'sku', code: 'ANOMALY_REVIEW', evidenceIds: ['event']}]} as const;

function input(testModel: ScriptedModel) {
  return {runId: 'run', scopeId: 'scope', deadlineMs: Date.now() + 90_000, config: {apiKey: 'test-only', model: 'scripted'}, testModel,
    inspect: async () => ({ok: true as const, value: inspection}),
    classify: async () => ({ok: false as const, error: {code: 'GPU_UNAVAILABLE' as const}}),
    calculate: async () => ({ok: true as const, value: calculation})};
}

function protocol(final: unknown) {
  return new ScriptedModel([
    [functionCall('inspectDemand', {}, {callId: 'call-1'})],
    [functionCall('classifyEvents', {}, {callId: 'call-2'})],
    [functionCall('calculateOrders', {}, {callId: 'call-3'})],
    [assistantMessage(JSON.stringify(final))],
  ]);
}

test('scripted transport exercises gated inspect/classify/calculate and validates decision', async () => {
  const model = protocol(decision);
  const result = await runOpenAiAgent(input(model));
  assert.equal(result.ok, true);
  assert.equal(result.classification?.status, 'failed');
  assert.equal(result.calculation?.calculationId, 'calc');
  assert.equal(result.decision?.calculationId, 'calc');
  assert.deepEqual(result.trace.map(event => event.name), ['inspectDemand', 'classifyEvents', 'calculateOrders', 'reviewDecision']);
  assert.equal(model.calls.length, 4);
});

test('rejects malformed and foreign final references', async () => {
  for (const final of [{...decision, calculationId: 'foreign'}, {...decision, attention: [{sku: 'sku', code: 'ANOMALY_REVIEW', evidenceIds: ['foreign']}]}]) {
    const result = await runOpenAiAgent(input(protocol(final)));
    assert.equal(result.ok, false);
    assert.equal(result.decision, null);
    assert.equal(result.errorCode, 'INVALID_OUTPUT');
  }
  assert.throws(() => validateAgentDecision({...decision, attention: [{sku: 'foreign', code: 'DATA_GAP', evidenceIds: []}]}, inspection, calculation));
});

test('final answer before tools is rejected', async () => {
  const model = new ScriptedModel([[assistantMessage(JSON.stringify(decision))]]);
  const result = await runOpenAiAgent(input(model));
  assert.equal(result.ok, false);
  assert.equal(result.calculation, null);
});

test('max six model turns is enforced', async () => {
  const model = new ScriptedModel(Array.from({length: 7}, (_, index) => [functionCall('inspectDemand', {}, {callId: `call-${index}`})]));
  const result = await runOpenAiAgent(input(model));
  assert.equal(result.ok, false);
  assert.ok(model.calls.length <= 6);
});
