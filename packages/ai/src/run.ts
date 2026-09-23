import {
  AiOutcomeSchema, CalculationSchema, RunReplenishmentInputSchema,
  type AiOutcome, type BackendTools, type Calculation, type RuntimeStatus,
  type SpecialistReport, type Warning,
} from '@atlas/contracts';
import type { Model } from '@openai/agents';
import { classifyOnGpu, type GpuDependencies } from './gpu/index.js';
import { loadAiConfig, type AiConfig } from './config.js';
import { runOpenAiAgent } from './openai/agent.js';

export interface RunDependencies {
  /** Explicit injection is for isolated transport tests only. */
  testModel?: Model;
  config?: AiConfig;
  gpu?: GpuDependencies;
  now?: () => number;
}

type FatalCode = Extract<AiOutcome, {ok: false}>['error']['code'];
const fatalCodes = new Set<FatalCode>(['DATA_GAP', 'CANDIDATE_LIMIT', 'CALCULATION_FAILED', 'DEADLINE_EXCEEDED']);

function fatal(code: unknown): AiOutcome {
  return {ok: false, error: {code: fatalCodes.has(code as FatalCode) ? code as FatalCode : 'CALCULATION_FAILED'}};
}

function dedupeWarnings(warnings: Warning[]): Warning[] {
  const seen = new Set<string>();
  return warnings.filter(warning => {
    const key = `${warning.code}\u0000${warning.sku ?? ''}\u0000${warning.evidenceIds.join(',')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fallbackCalculation(
  tools: BackendTools, specialist: SpecialistReport | null,
): Promise<{ok: true; value: Calculation} | {ok: false; code: FatalCode}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const result = await Promise.race([
      tools.calculate({specialist}, {signal: controller.signal}),
      new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error('Fallback timeout')), {once: true})),
    ]);
    if (!result.ok) return {ok: false, code: fatalCodes.has(result.error.code as FatalCode) ? result.error.code as FatalCode : 'CALCULATION_FAILED'};
    const parsed = CalculationSchema.safeParse(result.value);
    return parsed.success ? {ok: true, value: parsed.data} : {ok: false, code: 'CALCULATION_FAILED'};
  } catch {
    return {ok: false, code: controller.signal.aborted ? 'DEADLINE_EXCEEDED' : 'CALCULATION_FAILED'};
  } finally {
    clearTimeout(timer);
  }
}

/** A01: the model controls tool order, while T02 owns all numbers. */
export async function runReplenishment(
  rawInput: unknown, tools: BackendTools, dependencies: RunDependencies = {},
): Promise<AiOutcome> {
  const input = RunReplenishmentInputSchema.safeParse(rawInput);
  if (!input.success) return fatal('DATA_GAP');
  const now = dependencies.now ?? Date.now;
  const config = dependencies.config ?? loadAiConfig();
  const started = now();
  let gpuAttempts = 0;
  let gpuElapsedMs = 0;
  let agent: Awaited<ReturnType<typeof runOpenAiAgent>> | null = null;
  let unexpectedOpenAiFailure = false;

  if (config.openai && input.data.deadlineMs > now()) {
    try {
      agent = await runOpenAiAgent({
        runId: input.data.runId, scopeId: input.data.scopeId,
        deadlineMs: input.data.deadlineMs, config: config.openai,
        inspect: context => tools.inspect(context),
        classify: async (candidates, context) => {
          const began = now();
          try {
            return await classifyOnGpu(
              {candidates}, context, config.gpu,
              {...dependencies.gpu, onAttempt: attempt => {
                gpuAttempts = attempt;
                dependencies.gpu?.onAttempt?.(attempt);
              }},
            );
          } finally { gpuElapsedMs = Math.max(0, now() - began); }
        },
        calculate: (specialist, context) => tools.calculate({specialist}, context),
        testModel: dependencies.testModel,
      });
    } catch {
      // Invalid transport, provider, or SDK setup is a failed OpenAI run.
      unexpectedOpenAiFailure = true;
    }
  }

  if (agent?.fatalCode) return fatal(agent.fatalCode);
  const classification = agent?.classification ?? null;
  const specialist = classification?.status === 'success' ? classification.report : null;
  const gpuEvidence = classification?.status === 'success' ? classification.evidence : null;
  const openaiElapsedMs = agent?.elapsedMs ?? (config.openai ? Math.max(0, now() - started) : 0);
  let calculation = agent?.calculation ?? null;
  let usedFallback = false;
  let fallbackElapsedMs = 0;
  if (!calculation) {
    const fallbackStarted = now();
    const fallback = await fallbackCalculation(tools, specialist);
    fallbackElapsedMs = Math.max(0, now() - fallbackStarted);
    if (!fallback.ok) return fatal(fallback.code);
    calculation = fallback.value;
    usedFallback = true;
  }

  const openaiStatus: RuntimeStatus = {
    runtime: 'openai', status: agent?.ok ? 'success' : 'failed',
    model: config.openai?.model ?? null, attempts: agent?.attempts ?? 0,
    elapsedMs: openaiElapsedMs,
    errorCode: agent?.ok ? null : agent?.errorCode ?? (unexpectedOpenAiFailure ? 'RUNTIME_ERROR' : config.openai ? 'DEADLINE' : 'AUTH'),
    skipReason: null,
  };
  const gpuStatus: RuntimeStatus = classification?.status === 'success'
    ? {runtime: 'brev_gpu', status: 'success', model: config.gpu?.modelId ?? null,
      attempts: gpuAttempts, elapsedMs: gpuElapsedMs, errorCode: null, skipReason: null}
    : classification?.status === 'failed'
      ? {runtime: 'brev_gpu', status: 'failed', model: config.gpu?.modelId ?? null,
        attempts: gpuAttempts, elapsedMs: gpuElapsedMs, errorCode: classification.code, skipReason: null}
      : {runtime: 'brev_gpu', status: 'skipped', model: config.gpu?.modelId ?? null,
        attempts: 0, elapsedMs: 0, errorCode: null,
        skipReason: classification?.status === 'skipped' ? 'no_candidates' : 'not_reached'};

  const runtimeWarnings: Warning[] = [];
  if (openaiStatus.status === 'failed') runtimeWarnings.push({code: 'OPENAI_FAILED', sku: null, evidenceIds: []});
  if (gpuStatus.status === 'failed') runtimeWarnings.push({code: 'GPU_WORKLOAD_UNAVAILABLE', sku: null, evidenceIds: []});
  const trace = [...(agent?.trace ?? [])];
  if (usedFallback) trace.push({id: `${input.data.runId}:${trace.length + 1}`, kind: 'tool' as const,
    name: 'calculateOrders' as const, status: 'success' as const, elapsedMs: fallbackElapsedMs, evidenceIds: calculation.lines.map(line => line.sku)});
  trace.push({id: `${input.data.runId}:${trace.length + 1}`, kind: 'runtime' as const,
    name: 'openai' as const, status: openaiStatus.status, elapsedMs: openaiStatus.elapsedMs, evidenceIds: []});
  trace.push({id: `${input.data.runId}:${trace.length + 1}`, kind: 'runtime' as const,
    name: 'brev_gpu' as const, status: gpuStatus.status, elapsedMs: gpuStatus.elapsedMs,
    evidenceIds: specialist?.decisions.map(decision => decision.eventId) ?? []});

  const outcome: AiOutcome = {ok: true, result: {
    mode: agent?.ok && gpuStatus.status === 'success' ? 'live' : 'degraded',
    calculationId: calculation.calculationId, decision: agent?.ok ? agent.decision : null,
    specialist, candidates: calculation.candidates, runtimes: [openaiStatus, gpuStatus],
    gpuEvidence, trace, warnings: dedupeWarnings([...calculation.warnings, ...runtimeWarnings]),
    eventActions: calculation.eventActions,
  }};
  const parsed = AiOutcomeSchema.safeParse(outcome);
  return parsed.success ? parsed.data : fatal('CALCULATION_FAILED');
}
