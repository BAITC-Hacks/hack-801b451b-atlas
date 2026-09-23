import { readFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import {
  CandidatesSchema, GpuEvidenceSchema, SpecialistDecisionSchema, validateSpecialistReport,
  type Candidate, type GpuCallOutcome,
} from '@atlas/contracts';
import { loadAiConfig, type GpuConfig } from '../config.js';

export type GpuContext = { signal: AbortSignal; deadlineMs: number };
export type GpuDependencies = {
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  readVerificationRecord?: (path: string) => Promise<unknown>;
  onAttempt?: (attemptNumber: number) => void;
};

const MAX_BODY_BYTES = 64 * 1024;
const encoder = new TextEncoder();
const deploymentSchema = GpuEvidenceSchema.omit({
  inferenceResponseId: true, requestStartedAt: true, requestFinishedAt: true,
});

/** Fixed numeric case rubric. Labels are model output, then checked against the candidate set. */
export const fixedRubric = `You classify sales-event candidates from their numeric fields. Return one JSON object with a decisions array and no Markdown or prose. Copy each input eventId exactly once. Each decision has eventId, label, confidence, and evidenceCodes. The label is exactly one of "one_off", "recurring", or "uncertain". Set evidenceCodes to [] for every decision. Classify each candidate independently. Apply repeated-purchase evidence first: recurrenceCount >= 3 supports recurring even when one sale is large; use confidence >= 0.8 when the repeat signal is clear. Otherwise, quantity > max(6*medianQuantity, medianQuantity+6*madQuantity) with recurrenceCount < 3 supports one_off; use confidence >= 0.8 when the extreme signal is clear. Mixed or sparse evidence supports uncertain with confidence < 0.8. Confidence is a heuristic, not calibrated probability. HardOneOff events are governed by the backend hard rule. Do not invent quantities or extra fields.`;

function responseSchema(candidates: Candidate[]) {
  return {
    type: 'object', additionalProperties: false, required: ['decisions'],
    properties: {decisions: {
      type: 'array', minItems: candidates.length, maxItems: candidates.length,
      items: {type: 'object', additionalProperties: false,
        required: ['eventId', 'label', 'confidence', 'evidenceCodes'],
        properties: {
          eventId: {type: 'string', enum: candidates.map(candidate => candidate.eventId)},
          label: {type: 'string', enum: SpecialistDecisionSchema.shape.label.options},
          confidence: {type: 'number', minimum: 0, maximum: 1},
          evidenceCodes: {type: 'array', maxItems: 0, items: {type: 'string'}},
        },
      },
    }},
  };
}

type Code = Extract<GpuCallOutcome, { ok: false }>['error']['code'];
class GpuFailure extends Error {
  constructor(readonly code: Code, readonly transient = false) { super(code); }
}

async function boundedJson(response: Response): Promise<unknown> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new GpuFailure('INVALID_OUTPUT');
  if (!response.body) throw new GpuFailure('INVALID_OUTPUT');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) throw new GpuFailure('INVALID_OUTPUT');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  try {
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch { throw new GpuFailure('INVALID_OUTPUT'); }
}

function classifyHttp(status: number): GpuFailure {
  if (status === 401 || status === 403) return new GpuFailure('AUTH');
  if (status === 429) return new GpuFailure('RATE_LIMIT', true);
  if (status >= 500) return new GpuFailure('GPU_UNAVAILABLE', true);
  return new GpuFailure('RUNTIME_ERROR');
}

function requestSignal(context: GpuContext, now: () => number, timeoutMs: number) {
  const remaining = context.deadlineMs - now();
  if (context.signal.aborted || remaining <= 0) throw new GpuFailure('DEADLINE');
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  context.signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, Math.min(timeoutMs, remaining));
  return {
    signal: controller.signal,
    finish: () => { clearTimeout(timer); context.signal.removeEventListener('abort', abort); },
    failure: () => new GpuFailure(context.signal.aborted || context.deadlineMs <= now() ? 'DEADLINE' : timedOut ? 'TIMEOUT' : 'NETWORK', !context.signal.aborted && context.deadlineMs > now()),
  };
}

async function fetchJson(url: string, init: RequestInit, timeoutMs: number, context: GpuContext, deps: Required<Pick<GpuDependencies, 'fetch' | 'now'>>) {
  const guard = requestSignal(context, deps.now, timeoutMs);
  try {
    const response = await deps.fetch(url, { ...init, signal: guard.signal });
    if (!response.ok) throw classifyHttp(response.status);
    return await boundedJson(response);
  } catch (error) {
    if (error instanceof GpuFailure) throw error;
    throw guard.failure();
  } finally { guard.finish(); }
}

function verifyRecord(recordValue: unknown, detailValue: unknown, config: GpuConfig, now: () => number) {
  const record = deploymentSchema.safeParse(recordValue);
  if (!record.success) throw new GpuFailure('GPU_UNVERIFIED');
  const value = record.data;
  if (value.modelId !== config.modelId || Date.parse(value.verifiedAt) > now() || now() - Date.parse(value.verifiedAt) > 24 * 60 * 60 * 1000) throw new GpuFailure('GPU_UNVERIFIED');
  if (!/^infra\/brev\/evidence\/verification-[A-Za-z0-9-]+\.json$/.test(value.verificationArtifact)) throw new GpuFailure('GPU_UNVERIFIED');
  if (!/^sha256:[a-f0-9]{64}$/.test(value.imageDigest)) throw new GpuFailure('GPU_UNVERIFIED');
  if (!detailValue || typeof detailValue !== 'object') throw new GpuFailure('GPU_UNVERIFIED');
  const detail = detailValue as Record<string, unknown>;
  if (JSON.stringify(detail.record) !== JSON.stringify(value) || !/^[a-f0-9]{64}$/.test(String(detail.modelSha256)) || typeof detail.smokeResponseId !== 'string' || !detail.smokeResponseId) throw new GpuFailure('GPU_UNVERIFIED');
  if (!Array.isArray(detail.computeSamples) || !detail.computeSamples.some(sample => sample && typeof sample === 'object' && Number((sample as Record<string, unknown>).smUtil) > 0)) throw new GpuFailure('GPU_UNVERIFIED');
  return value;
}

/** Sole production adapter for the private Brev inference boundary. */
export async function classifyOnGpu(
  input: { candidates: Candidate[] }, context: GpuContext,
  config: GpuConfig | null = loadAiConfig().gpu, dependencies: GpuDependencies = {},
): Promise<GpuCallOutcome> {
  const deps = {
    fetch: dependencies.fetch ?? globalThis.fetch,
    now: dependencies.now ?? Date.now,
    readVerificationRecord: dependencies.readVerificationRecord ?? (async (path: string) => JSON.parse(await readFile(path, 'utf8')) as unknown),
  };
  try {
    if (!config) throw new GpuFailure('GPU_UNAVAILABLE');
    const candidates = CandidatesSchema.parse(input.candidates);
    if (!candidates.length) throw new GpuFailure('INVALID_OUTPUT');
    if (new Set(candidates.map(candidate => candidate.eventId)).size !== candidates.length) throw new GpuFailure('INVALID_OUTPUT');
    if (context.signal.aborted || context.deadlineMs <= deps.now()) throw new GpuFailure('DEADLINE');
    const recordValue = await deps.readVerificationRecord(config.verificationPath).catch(() => { throw new GpuFailure('GPU_UNVERIFIED'); });
    const rawArtifact = (recordValue as Record<string, unknown> | null)?.verificationArtifact;
    if (typeof rawArtifact !== 'string' || !/^infra\/brev\/evidence\/verification-[A-Za-z0-9-]+\.json$/.test(rawArtifact)) throw new GpuFailure('GPU_UNVERIFIED');
    const detailPath = join(dirname(config.verificationPath), basename(rawArtifact));
    const detailValue = await deps.readVerificationRecord(detailPath).catch(() => { throw new GpuFailure('GPU_UNVERIFIED'); });
    const record = verifyRecord(recordValue, detailValue, config, deps.now);
    const models = await fetchJson(`${config.serviceUrl}/v1/models`, { method: 'GET' }, 2_000, context, deps);
    if (!models || typeof models !== 'object' || !Array.isArray((models as { data?: unknown }).data) || !(models as { data: unknown[] }).data.some(item => item && typeof item === 'object' && (item as { id?: unknown }).id === config.modelId)) throw new GpuFailure('GPU_UNAVAILABLE');
    const payload = {
      model: config.modelId,
      messages: [{ role: 'system', content: fixedRubric }, { role: 'user', content: JSON.stringify({ candidates }) }],
      temperature: 0, max_tokens: 4096, stream: false,
      response_format: {type: 'json_object', schema: responseSchema(candidates)},
    };
    if (encoder.encode(JSON.stringify(payload)).length > MAX_BODY_BYTES) throw new GpuFailure('INVALID_OUTPUT');
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        dependencies.onAttempt?.(attempt);
        const requestStartedAt = new Date(deps.now()).toISOString();
        const response = await fetchJson(`${config.serviceUrl}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }, 10_000, context, deps);
        const requestFinishedAt = new Date(deps.now()).toISOString();
        if (!response || typeof response !== 'object') throw new GpuFailure('INVALID_OUTPUT');
        const wire = response as Record<string, unknown>;
        if (typeof wire.id !== 'string' || !wire.id || wire.model !== config.modelId || !Array.isArray(wire.choices) || wire.choices.length !== 1) throw new GpuFailure('INVALID_OUTPUT');
        const choice = wire.choices[0] as Record<string, unknown> | null;
        if (!choice || typeof choice !== 'object' || choice.index !== 0 || choice.finish_reason !== 'stop' || !choice.message || typeof choice.message !== 'object') throw new GpuFailure('INVALID_OUTPUT');
        const message = choice.message as Record<string, unknown>;
        if (message.role !== 'assistant' || typeof message.content !== 'string' || !message.content || message.tool_calls !== undefined || message.function_call !== undefined || message.refusal !== undefined) throw new GpuFailure('INVALID_OUTPUT');
        let reportValue: unknown;
        try { reportValue = JSON.parse(message.content); } catch { throw new GpuFailure('INVALID_OUTPUT'); }
        let report;
        try { report = validateSpecialistReport(reportValue, candidates); } catch { throw new GpuFailure('INVALID_OUTPUT'); }
        const evidence = GpuEvidenceSchema.parse({ ...record, inferenceResponseId: wire.id, requestStartedAt, requestFinishedAt });
        return { ok: true, report, evidence };
      } catch (error) {
        const failure = error instanceof GpuFailure ? error : new GpuFailure('INVALID_OUTPUT');
        if (!failure.transient || attempt === 2) throw failure;
        const delay = Math.min(500, Math.max(0, context.deadlineMs - deps.now()));
        if (delay) await new Promise<void>(resolve => setTimeout(resolve, delay));
      }
    }
    throw new GpuFailure('RUNTIME_ERROR');
  } catch (error) {
    return { ok: false, error: { code: error instanceof GpuFailure ? error.code : 'INVALID_OUTPUT' } };
  }
}
