import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { parseEnv } from 'node:util';

export interface OpenAiConfig {
  apiKey: string;
  model: string;
}

export interface GpuConfig {
  serviceUrl: string;
  modelId: string;
  verificationPath: string;
}

export interface AiConfig {
  openai: OpenAiConfig | null;
  gpu: GpuConfig | null;
  issues: readonly ConfigIssue[];
}

export type ConfigIssue =
  | 'OPENAI_API_KEY_MISSING'
  | 'OPENAI_MODEL_MISSING'
  | 'GPU_MODEL_ID_MISSING'
  | 'GPU_SERVICE_URL_INVALID'
  | 'GPU_VERIFICATION_PATH_MISSING';

export interface AiRuntimeDependencies<TModelTransport = unknown> {
  modelTransport?: TModelTransport;
  fetch: typeof globalThis.fetch;
  now: () => number;
  readVerificationRecord: (path: string) => Promise<unknown>;
}

const DEFAULT_GPU_SERVICE_URL = 'http://gpu-specialist:8000';

/** Read repository .env with Node's native parser; exported values take precedence. */
export function readServerEnvironment(
  cwd = process.cwd(),
  exported: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  let directory = resolve(cwd);
  while (true) {
    const marker = join(directory, '.git');
    const workspace = join(directory, 'pnpm-workspace.yaml');
    if (existsSync(marker) || existsSync(workspace)) {
      const envPath = join(directory, '.env');
      const fileValues = existsSync(envPath)
        ? parseEnv(readFileSync(envPath, 'utf8'))
        : {};
      return { ...fileValues, ...exported };
    }
    const parent = dirname(directory);
    if (parent === directory) return { ...exported };
    directory = parent;
  }
}

/** Configuration is distinct from runtime success and never probes a model. */
export function loadAiConfig(env: NodeJS.ProcessEnv = readServerEnvironment()): AiConfig {
  const issues: ConfigIssue[] = [];
  const apiKey = env.OPENAI_API_KEY?.trim();
  const openaiModel = env.OPENAI_MODEL?.trim();
  if (!apiKey) issues.push('OPENAI_API_KEY_MISSING');
  if (!openaiModel) issues.push('OPENAI_MODEL_MISSING');

  const serviceUrl = env.GPU_SERVICE_URL?.trim() || DEFAULT_GPU_SERVICE_URL;
  const gpuModel = env.GPU_MODEL_ID?.trim();
  const verificationPath = env.GPU_VERIFICATION_PATH?.trim();
  if (!isPrivateGpuEndpoint(serviceUrl)) issues.push('GPU_SERVICE_URL_INVALID');
  if (!gpuModel) issues.push('GPU_MODEL_ID_MISSING');
  if (!verificationPath || !isAbsolute(verificationPath)) {
    issues.push('GPU_VERIFICATION_PATH_MISSING');
  }

  return {
    openai: apiKey && openaiModel ? { apiKey, model: openaiModel } : null,
    gpu: isPrivateGpuEndpoint(serviceUrl) && gpuModel && verificationPath && isAbsolute(verificationPath)
      ? { serviceUrl, modelId: gpuModel, verificationPath }
      : null,
    issues,
  };
}

function isPrivateGpuEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:'
      && ['gpu-specialist', '127.0.0.1', 'localhost'].includes(url.hostname)
      && url.port === '8000'
      && url.pathname === '/'
      && !url.username
      && !url.password
      && !url.search
      && !url.hash;
  } catch {
    return false;
  }
}
