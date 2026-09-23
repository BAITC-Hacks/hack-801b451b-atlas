import assert from 'node:assert/strict';
import test from 'node:test';
import type { Candidate } from '@atlas/contracts';
import { classifyOnGpu, type GpuDependencies } from '../src/gpu/index.ts';

const now = Date.parse('2026-09-23T12:00:00.000Z');
const config = { serviceUrl: 'http://gpu-specialist:8000', modelId: 'atlas-specialist', verificationPath: '/app/infra/brev/evidence/deployment.json' };
const candidate: Candidate = { eventId: 'sale-1', sku: 'SKU1', date: '2026-01-01', quantity: 42, medianQuantity: 5, madQuantity: 1, priorObservationCount: 20, recurrenceCount: 4, customerShare90d: 0.4, eventValue: 420, hardOneOff: false };
const record = { deploymentId: 'deployment-1', brevInstanceId: 'instance', containerId: 'container', gpuName: 'NVIDIA L40S', gpuUuid: 'GPU-1', runtime: 'llama_cpp_cuda', imageDigest: `sha256:${'a'.repeat(64)}`, modelId: 'atlas-specialist', modelRevision: 'revision', verifiedAt: new Date(now - 1000).toISOString(), verificationArtifact: 'infra/brev/evidence/verification-abc.json' };
const detail = { record, modelSha256: 'b'.repeat(64), smokeResponseId: 'prior-real-response', computeSamples: [{ pid: '123', smUtil: 32 }] };
const context = () => ({ signal: new AbortController().signal, deadlineMs: now + 30_000 });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const success = (content: unknown) => ({ id: 'response-1', model: 'atlas-specialist', choices: [{ index: 0, message: { role: 'assistant', content: typeof content === 'string' ? content : JSON.stringify(content) }, finish_reason: 'stop' }] });
const report = { decisions: [{ eventId: 'sale-1', label: 'recurring', confidence: 0.83, evidenceCodes: ['REPEATED_PURCHASES'] }] };

function deps(fetch: typeof globalThis.fetch, deployment: unknown = record, artifact: unknown = detail): GpuDependencies {
  return { now: () => now, fetch, readVerificationRecord: async path => path.endsWith('deployment.json') ? deployment : artifact };
}

test('G01 uses fixed numeric rubric and returns validated report with observed evidence', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return calls.length === 1 ? json({ data: [{ id: config.modelId }] }) : json(success(report));
  }) as typeof globalThis.fetch;
  const outcome = await classifyOnGpu({ candidates: [candidate] }, context(), config, deps(fakeFetch));
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.deepEqual(outcome.report, report);
  assert.equal(outcome.evidence.inferenceResponseId, 'response-1');
  assert.equal(outcome.evidence.deploymentId, record.deploymentId);
  assert.equal(calls[0]?.url, 'http://gpu-specialist:8000/v1/models');
  assert.equal(calls[1]?.url, 'http://gpu-specialist:8000/v1/chat/completions');
  const body = JSON.parse(String(calls[1]?.init?.body));
  assert.equal(body.model, config.modelId);
  assert.equal(body.temperature, 0);
  assert.equal(body.max_tokens, 4096);
  assert.equal(body.stream, false);
  assert.deepEqual(JSON.parse(body.messages[1].content), { candidates: [candidate] });
  assert.equal(body.response_format.type, 'json_object');
  assert.deepEqual(body.response_format.schema.properties.decisions.items.properties.eventId.enum, [candidate.eventId]);
  assert.deepEqual(body.response_format.schema.properties.decisions.items.properties.label.enum, ['one_off', 'recurring', 'uncertain']);
  assert.equal(body.response_format.schema.properties.decisions.minItems, 1);
  assert.equal(body.response_format.schema.properties.decisions.items.properties.evidenceCodes.maxItems, 0);
});

test('missing or mismatched GPU proof fails closed before network', async () => {
  let calls = 0;
  const fakeFetch = (async () => { calls++; return json({}); }) as typeof globalThis.fetch;
  for (const deployment of [null, { ...record, modelId: 'wrong' }, { ...record, verifiedAt: new Date(now - 86_400_001).toISOString() }]) {
    const result = await classifyOnGpu({ candidates: [candidate] }, context(), config, deps(fakeFetch, deployment));
    assert.deepEqual(result, { ok: false, error: { code: 'GPU_UNVERIFIED' } });
  }
  const result = await classifyOnGpu({ candidates: [candidate] }, context(), config, deps(fakeFetch, record, { ...detail, computeSamples: [] }));
  assert.deepEqual(result, { ok: false, error: { code: 'GPU_UNVERIFIED' } });
  assert.equal(calls, 0);
});

test('readiness model mismatch fails without inference attempt', async () => {
  let attempts = 0;
  const fakeFetch = (async () => json({ data: [{ id: 'other' }] })) as typeof globalThis.fetch;
  const result = await classifyOnGpu({ candidates: [candidate] }, context(), config, { ...deps(fakeFetch), onAttempt: () => attempts++ });
  assert.deepEqual(result, { ok: false, error: { code: 'GPU_UNAVAILABLE' } });
  assert.equal(attempts, 0);
});

test('rejects model mismatch, truncated choices, foreign IDs, unsupported evidence and oversized bodies', async () => {
  const variants = [
    { ...success(report), model: 'foreign' },
    { ...success(report), choices: [{ ...success(report).choices[0], finish_reason: 'length' }] },
    success({ decisions: [{ ...report.decisions[0], eventId: 'foreign' }] }),
    success({ decisions: [{ ...report.decisions[0], evidenceCodes: ['CUSTOMER_CONCENTRATION'] }] }),
    { ...success(report), choices: [{ ...success(report).choices[0], message: { ...success(report).choices[0].message, tool_calls: [{ id: 'untrusted' }] } }] },
    success('x'.repeat(65_536)),
  ];
  for (const variant of variants) {
    let count = 0;
    const fakeFetch = (async () => ++count === 1 ? json({ data: [{ id: config.modelId }] }) : json(variant)) as typeof globalThis.fetch;
    const result = await classifyOnGpu({ candidates: [candidate] }, context(), config, deps(fakeFetch));
    assert.deepEqual(result, { ok: false, error: { code: 'INVALID_OUTPUT' } });
    assert.equal(count, 2);
  }
});

test('retries one transient 5xx and counts only inference calls', async () => {
  let count = 0;
  const attempts: number[] = [];
  const fakeFetch = (async () => {
    count++;
    return count === 1 ? json({ data: [{ id: config.modelId }] }) : count === 2 ? json({}, 503) : json(success(report));
  }) as typeof globalThis.fetch;
  const result = await classifyOnGpu({ candidates: [candidate] }, context(), config, { ...deps(fakeFetch), onAttempt: n => attempts.push(n) });
  assert.equal(result.ok, true);
  assert.deepEqual(attempts, [1, 2]);
  assert.equal(count, 3);
});

test('deadline and invalid candidates fail before network', async () => {
  let calls = 0;
  const fakeFetch = (async () => { calls++; return json({}); }) as typeof globalThis.fetch;
  assert.deepEqual(await classifyOnGpu({ candidates: [candidate] }, { signal: new AbortController().signal, deadlineMs: now - 1 }, config, deps(fakeFetch)), { ok: false, error: { code: 'DEADLINE' } });
  assert.deepEqual(await classifyOnGpu({ candidates: [candidate, candidate] }, context(), config, deps(fakeFetch)), { ok: false, error: { code: 'INVALID_OUTPUT' } });
  assert.equal(calls, 0);
});
