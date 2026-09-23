import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { loadAiConfig, readServerEnvironment } from '../src/config.ts';

test('missing access stays unconfigured without claiming runtime success', () => {
  const config = loadAiConfig({});
  assert.equal(config.openai, null);
  assert.equal(config.gpu, null);
  assert.deepEqual(config.issues, [
    'OPENAI_API_KEY_MISSING',
    'OPENAI_MODEL_MISSING',
    'GPU_MODEL_ID_MISSING',
    'GPU_VERIFICATION_PATH_MISSING',
  ]);
});

test('configured endpoints remain private and do not imply execution', () => {
  const config = loadAiConfig({
    OPENAI_API_KEY: 'test-key',
    OPENAI_MODEL: 'test-model',
    GPU_MODEL_ID: 'test-gpu-model',
    GPU_VERIFICATION_PATH: resolve('evidence.json'),
  });
  assert.deepEqual(config.issues, []);
  assert.equal(config.gpu?.serviceUrl, 'http://gpu-specialist:8000');
  assert.equal(config.openai?.model, 'test-model');
  assert.equal('runtimeStatus' in config, false);
});

test('rejects external or path-bearing GPU URLs', () => {
  const base = {
    GPU_MODEL_ID: 'test-gpu-model',
    GPU_VERIFICATION_PATH: resolve('evidence.json'),
  };
  for (const url of [
    'https://gpu-specialist:8000',
    'http://example.com:8000',
    'http://gpu-specialist:8000/v1',
    'http://gpu-specialist:8000?token=secret',
  ]) {
    const config = loadAiConfig({ ...base, GPU_SERVICE_URL: url });
    assert.equal(config.gpu, null);
    assert.ok(config.issues.includes('GPU_SERVICE_URL_INVALID'));
  }
});

test('repository .env supplies defaults while exported values win', () => {
  const root = mkdtempSync(join(tmpdir(), 'atlas-ai-config-'));
  try {
    mkdirSync(join(root, '.git'));
    mkdirSync(join(root, 'packages', 'ai'), { recursive: true });
    writeFileSync(join(root, '.env'), 'OPENAI_MODEL=file-model\nGPU_MODEL_ID=file-gpu\n');
    const env = readServerEnvironment(join(root, 'packages', 'ai'), {
      OPENAI_MODEL: 'exported-model',
    });
    assert.equal(env.OPENAI_MODEL, 'exported-model');
    assert.equal(env.GPU_MODEL_ID, 'file-gpu');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
