import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const baseUrl = process.env.ATLAS_BASE_URL ?? 'http://localhost:3000';
const browser = await chromium.launch({
  headless: true,
  ...(process.env.ATLAS_CHROME_PATH
    ? { executablePath: process.env.ATLAS_CHROME_PATH }
    : { channel: 'chrome' }),
});

try {
  const page = await browser.newPage({ acceptDownloads: true });
  let runPosts = 0;
  page.on('request', request => {
    if (request.url() === `${baseUrl}/api/v1/runs` && request.method() === 'POST') runPosts++;
  });
  await page.goto(baseUrl);
  await page.waitForFunction(() => document.querySelector('select')?.options.length > 1);
  assert.match(await page.getByRole('combobox', { name: 'Выбрать набор' }).inputValue(), /^[A-Za-z0-9_.:-]+$/);
  await page.getByRole('combobox', { name: 'Склад' }).selectOption('WH_DEMO');

  const [createdResponse] = await Promise.all([
    page.waitForResponse(response => response.url() === `${baseUrl}/api/v1/runs` && response.request().method() === 'POST', { timeout: 120_000 }),
    page.getByRole('button', { name: 'Рассчитать потребность' }).click(),
  ]);
  assert.equal(createdResponse.status(), 201);
  const { run: draft } = await createdResponse.json();
  assert.equal(draft.status, 'draft');
  assert.equal(draft.revision, 1);
  assert.equal(draft.mode, 'degraded');
  assert.equal(draft.ai.runtimes[0].status, 'success');
  assert.equal(draft.ai.runtimes[1].status, 'failed');
  assert.equal(draft.ai.specialist, null);
  assert.equal(draft.lines.length, 6);
  assert.deepEqual(draft.ai.trace.filter(event => event.kind === 'tool').map(event => event.name),
    ['inspectDemand', 'classifyEvents', 'calculateOrders']);
  await page.getByText('Выполненные шаги').waitFor();

  const firstLine = draft.lines[0];
  await page.locator('tbody tr').first().getByRole('button', { name: 'Изменить количество' }).click();
  await page.getByRole('spinbutton', { name: 'К заказу' }).fill(String(firstLine.finalQty + 1));
  await page.getByRole('textbox', { name: 'Причина изменения' }).fill('Проверка демонстрационной редакции');
  const [editedResponse] = await Promise.all([
    page.waitForResponse(response => response.url() === `${baseUrl}/api/v1/runs/${draft.id}/lines` && response.request().method() === 'PATCH'),
    page.getByRole('button', { name: 'Сохранить' }).click(),
  ]);
  assert.equal(editedResponse.status(), 200);
  const { run: edited } = await editedResponse.json();
  assert.equal(edited.revision, 2);
  assert.equal(edited.lines.find(line => line.sku === firstLine.sku).finalQty, firstLine.finalQty + 1);
  assert.equal(edited.lines.find(line => line.sku === firstLine.sku).recommendedQty, firstLine.recommendedQty);

  const stale = await page.request.patch(`${baseUrl}/api/v1/runs/${draft.id}/lines`, {
    headers: { Origin: baseUrl },
    data: { expectedRevision: 1, changes: [{ sku: firstLine.sku, finalQty: 1, overrideReason: 'Stale test' }] },
  });
  assert.equal(stale.status(), 409);
  assert.equal((await stale.json()).error.code, 'REVISION_CONFLICT');

  await page.getByRole('checkbox', { name: /Я проверил предупреждения/ }).check();
  await page.getByRole('checkbox', { name: /Подтвердите текущую редакцию заказа/ }).check();
  const [approvedResponse] = await Promise.all([
    page.waitForResponse(response => response.url() === `${baseUrl}/api/v1/runs/${draft.id}/approve` && response.request().method() === 'POST'),
    page.getByRole('button', { name: 'Утвердить заказ' }).click(),
  ]);
  assert.equal(approvedResponse.status(), 200);
  const { run: approved } = await approvedResponse.json();
  assert.equal(approved.status, 'approved');
  assert.equal(approved.revision, 3);

  await page.getByRole('button', { name: 'EN' }).click();
  await page.getByRole('heading', { name: 'Recommendations by supplier' }).first().waitFor();
  assert.equal(runPosts, 1);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download CSV' }).click(),
  ]);
  assert.equal(download.suggestedFilename(), `order-${draft.id}.csv`);
  const csv = await readFile(await download.path());
  assert.deepEqual([...csv.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.match(csv.toString('utf8'), /Recommended/);
  assert.match(csv.toString('utf8'), new RegExp(`"${firstLine.recommendedQty}";"${firstLine.finalQty + 1}"`));

  await page.reload();
  await page.getByText('Order approved', { exact: true }).first().waitFor();
  assert.match(await page.locator('main').innerText(), /Revision: 3/);
  assert.equal(runPosts, 1);
  const persisted = await page.request.get(`${baseUrl}/api/v1/runs/${draft.id}`);
  assert.equal(persisted.status(), 200);
  assert.equal((await persisted.json()).run.revision, 3);
  console.log(JSON.stringify({ result: 'pass', runId: draft.id, datasetId: draft.datasetId,
    openai: draft.ai.runtimes[0].status, brevGpu: draft.ai.runtimes[1].status,
    lines: draft.lines.length, approvedRevision: approved.revision, staleStatus: stale.status(),
    csvBytes: csv.length, runPosts }));
} finally {
  await browser.close();
}
