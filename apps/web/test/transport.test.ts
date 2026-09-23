import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { DatasetInputSchema, RunResponseSchema } from "@atlas/contracts";
import { ApiError, createApiClient } from "../src/lib/api";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const dataset = DatasetInputSchema.parse(fixture("synthetic-dataset.json"));
const run = RunResponseSchema.parse(fixture("degraded-run.json"));
const summary = {
  id: "ds-1", label: dataset.label, kind: "synthetic", asOf: dataset.asOf,
  historyStart: dataset.historyStart, hash: "a".repeat(64), warehouses: dataset.warehouses,
  categories: dataset.categories.map(({ id, name }) => ({ id, name })), itemCount: 1, saleCount: 1,
};

function mock(response: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const client = createApiClient((async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} });
    return response(String(url), init ?? {});
  }) as typeof fetch);
  return { client, calls };
}
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

test("H01-H04 use exact paths, bodies, and strict shared response schemas", async () => {
  const { client, calls } = mock((url) => {
    if (url.endsWith("/datasets")) return json(url.includes("/api/") ? { datasets: [summary] } : {}, 200);
    return json(run, 201);
  });
  assert.deepEqual((await client.listDatasets()).datasets, [summary]);
  assert.deepEqual(calls[0]?.url, "/api/v1/datasets");
  assert.equal(calls[0]?.init.method, "GET");
  const imported = mock(() => json({ dataset: summary }, 201));
  assert.equal((await imported.client.importDataset(dataset)).dataset.id, "ds-1");
  assert.equal(imported.calls[0]?.url, "/api/v1/datasets");
  assert.equal(imported.calls[0]?.init.method, "POST");
  assert.deepEqual(JSON.parse(String(imported.calls[0]?.init.body)), dataset);
  assert.equal((imported.calls[0]?.init.headers as Record<string, string>)["Content-Type"], "application/json");
  const runs = mock((_url, init) => json(run, init.method === "POST" ? 201 : 200));
  assert.equal((await runs.client.createRun({ datasetId: "ds-1", warehouseId: "wh-1" })).run.ai.specialist, null);
  assert.equal(runs.calls[0]?.url, "/api/v1/runs");
  assert.equal(runs.calls[0]?.init.method, "POST");
  assert.deepEqual(JSON.parse(String(runs.calls[0]?.init.body)), { datasetId: "ds-1", warehouseId: "wh-1" });
  assert.equal((await runs.client.getRun("run-1")).run.id, "run-1");
  assert.equal(runs.calls[1]?.url, "/api/v1/runs/run-1");
  assert.equal(runs.calls[1]?.init.method, "GET");
});

test("H05-H07 preserve revision, locale, and CSV filename", async () => {
  const { client, calls } = mock((url) => url.includes("/export?")
    ? new Response("\ufeffwarehouse_code;sku\r\n", { status: 200, headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=\"order-run-1.csv\"" } })
    : json(run));
  const changes = { expectedRevision: 1, changes: [{ sku: "sku-1", finalQty: 2, overrideReason: "test adjustment" }] };
  await client.changeLines("run-1", changes);
  assert.equal(calls[0]?.url, "/api/v1/runs/run-1/lines");
  assert.equal(calls[0]?.init.method, "PATCH");
  assert.deepEqual(JSON.parse(String(calls[0]?.init.body)), changes);
  const approval = { expectedRevision: 1, confirm: true as const, acknowledgeWarnings: true };
  await client.approveRun("run-1", approval);
  assert.equal(calls[1]?.url, "/api/v1/runs/run-1/approve");
  assert.equal(calls[1]?.init.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[1]?.init.body)), approval);
  const exported = await client.exportRun("run-1", { locale: "en", revision: 2 });
  assert.equal(calls[2]?.url, "/api/v1/runs/run-1/export?locale=en&revision=2");
  assert.equal(calls[2]?.init.method, "GET");
  assert.equal(exported.filename, "order-run-1.csv");
  assert.equal(exported.locale, "en");
  assert.equal(exported.revision, 2);
  assert.match(await exported.bytes.text(), /^\ufeff/);
});

test("typed errors distinguish 403, 409, 422, 503 and 504", async () => {
  for (const [status, code] of [[403, "FORBIDDEN"], [409, "REVISION_CONFLICT"], [422, "REVIEW_REQUIRED"], [503, "DB_UNAVAILABLE"], [504, "DEADLINE_EXCEEDED"]] as const) {
    const { client } = mock(() => json({ error: { code, requestId: "request-1" } }, status));
    await assert.rejects(client.getRun("run-1"), (error: unknown) => error instanceof ApiError && error.status === status && error.code === code && error.requestId === "request-1");
  }
});

test("degraded 201 parses, malformed nullability fails, and duplicate submit is blocked", async () => {
  const { client } = mock(() => json(run, 201));
  assert.equal((await client.createRun({ datasetId: "ds-1", warehouseId: "wh-1" })).run.mode, "degraded");
  const invalid = structuredClone(run);
  invalid.run.ai.specialist = { decisions: [] };
  const malformed = mock(() => json(invalid, 201));
  await assert.rejects(malformed.client.createRun({ datasetId: "ds-1", warehouseId: "wh-1" }), (error: unknown) => error instanceof ApiError && error.code === "INVALID_RESPONSE");
  let release!: (value: Response) => void;
  const pending = mock(() => new Promise<Response>((resolve) => { release = resolve; }));
  const first = pending.client.createRun({ datasetId: "ds-1", warehouseId: "wh-1" });
  await assert.rejects(pending.client.createRun({ datasetId: "ds-1", warehouseId: "wh-1" }), (error: unknown) => error instanceof ApiError && error.code === "DUPLICATE_REQUEST");
  assert.equal(pending.calls.length, 1);
  release(json(run, 201));
  await first;
});

test("test-only GPU success stub needs specialist and evidence together", () => {
  const stub = fixture("gpu-success-stub.json");
  assert.equal(stub.testOnly, true);
  const live = structuredClone(run);
  live.run.mode = "live";
  live.run.ai.mode = "live";
  live.run.ai.runtimes[0] = { runtime: "openai", status: "success", model: "test-only-model", attempts: 1, elapsedMs: 1, errorCode: null, skipReason: null };
  live.run.ai.runtimes[1] = { runtime: "brev_gpu", status: stub.status, model: "test-only-model", attempts: 1, elapsedMs: 1, errorCode: null, skipReason: null };
  live.run.ai.specialist = { decisions: [] };
  live.run.ai.gpuEvidence = {
    deploymentId: "test-only", brevInstanceId: "test-only", containerId: "test-only",
    gpuName: "test-only", gpuUuid: "test-only", runtime: "llama_cpp_cuda",
    imageDigest: "test-only", modelId: "test-only", modelRevision: "test-only",
    verifiedAt: "2026-04-01T00:00:00.000Z", verificationArtifact: "test-only",
    inferenceResponseId: "test-only", requestStartedAt: "2026-04-01T00:00:00.000Z",
    requestFinishedAt: "2026-04-01T00:00:01.000Z",
  };
  assert.equal(RunResponseSchema.parse(live).run.ai.runtimes[1]?.status, "success");
  live.run.ai.gpuEvidence = null;
  assert.equal(RunResponseSchema.safeParse(live).success, false);
});

test("caller cancellation clears pending state; GPU stub remains test-only", async () => {
  const abort = new AbortController();
  const { client } = mock((_url, init) => new Promise<Response>((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  }));
  const pending = client.createRun({ datasetId: "ds-1", warehouseId: "wh-1" }, abort.signal);
  abort.abort();
  await assert.rejects(pending, (error: unknown) => error instanceof ApiError && error.code === "CANCELLED");
});
