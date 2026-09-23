import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createDb } from '@atlas/db';
import { buildSyntheticDataset } from '@atlas/db/fixture';
import { CreateDatasetResponseSchema, HealthResponseSchema, ListDatasetsResponseSchema } from '@atlas/contracts';
import { buildApp } from '../src/app.js';
import { loadRepositoryEnv } from '../src/config.js';

loadRepositoryEnv();

test('H01/H02/H08 persist normalized imports and reject invalid input', async () => {
  const db = createDb();
  const app = buildApp(db);
  try {
    const health = await app.inject({method: 'GET', url: '/api/v1/health'});
    assert.equal(health.statusCode, 200);
    HealthResponseSchema.parse(health.json());
    const fixture = {...buildSyntheticDataset(), label: `Import test ${randomUUID()}`};
    const headers = {'origin': process.env.WEB_ORIGIN || 'http://localhost:3000', 'content-type': 'application/json'};
    const created = await app.inject({method: 'POST', url: '/api/v1/datasets', headers, payload: fixture});
    assert.equal(created.statusCode, 201, created.body);
    const parsed = CreateDatasetResponseSchema.parse(created.json());
    assert.equal(parsed.dataset.saleCount, fixture.sales.length);
    const listed = await app.inject({method: 'GET', url: '/api/v1/datasets'});
    assert.equal(listed.statusCode, 200);
    assert.ok(ListDatasetsResponseSchema.parse(listed.json()).datasets.some(item => item.id === parsed.dataset.id));
    const bad = await app.inject({method: 'POST', url: '/api/v1/datasets', headers, payload: {...fixture, privacyConfirmed: false}});
    assert.equal(bad.statusCode, 400);
    assert.equal(bad.json().error.code, 'VALIDATION_ERROR');
    const wrongOrigin = await app.inject({method: 'POST', url: '/api/v1/datasets', headers: {...headers, origin: 'http://evil.example'}, payload: fixture});
    assert.equal(wrongOrigin.statusCode, 403);
    const tooLarge = await app.inject({method: 'POST', url: '/api/v1/datasets', headers, payload: {...fixture, label: 'x'.repeat(5 * 1024 * 1024)}});
    assert.equal(tooLarge.statusCode, 413);
  } finally { await app.close(); await db.close(); }
});
