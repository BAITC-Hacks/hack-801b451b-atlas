import assert from "node:assert/strict";
import { test } from "node:test";
import { orderRunLines } from "../src/lib/priority.ts";
import { preflightSalesCsv } from "../src/lib/sales-csv.ts";

const header = "id,date,sku,warehouseId,quantity,customerToken,unitPrice";
const token = "anon_0123456789abcdef";
const sale = (id: string, sku = "SKU-1") => `${id},2026-01-01,${sku},WH-1,2,${token},10.25`;

test("priority sort puts high before normal before none and preserves ties and source", () => {
  const lines = [{sku: "n1", urgency: "normal"}, {sku: "h1", urgency: "high"},
    {sku: "z1", urgency: "none"}, {sku: "h2", urgency: "high"}, {sku: "n2", urgency: "normal"}];
  const source = lines.map(line => line.sku);
  assert.deepEqual(orderRunLines(lines as never, true).map(line => line.sku), ["h1", "h2", "n1", "n2", "z1"]);
  assert.deepEqual(orderRunLines(lines as never, false).map(line => line.sku), source);
  assert.deepEqual(lines.map(line => line.sku), source);
});

test("valid sales CSV passes, including quoted commas, escaped quotes, and newlines", () => {
  const csv = `${header},note\r\n${sale("s-1")},"memo, line 1\nline ""2"""\r\n`;
  assert.deepEqual(preflightSalesCsv(csv), {dataRows: 1, issues: []});
});

test("duplicate sale IDs and repeated data rows identify physical row numbers", () => {
  const csv = `${header}\n${sale("s-1")}\n${sale("s-1", "SKU-2")}\n${sale("s-1")}\n`;
  const issues = preflightSalesCsv(csv).issues;
  assert.deepEqual(issues.filter(issue => issue.code === "duplicateId").map(issue => [issue.row, issue.firstRow]), [[3, 2], [4, 2]]);
  assert.deepEqual(issues.filter(issue => issue.code === "duplicateRow").map(issue => [issue.row, issue.firstRow]), [[4, 2]]);
});

test("missing required columns and values, invalid dates and numbers are reported", () => {
  assert.deepEqual(preflightSalesCsv("id,date\ns-1,2026-01-01").issues.filter(issue => issue.code === "missingColumn").map(issue => issue.column),
    ["sku", "warehouseId", "quantity", "customerToken", "unitPrice"]);
  const csv = `${header}\ns-1,2026-02-30,,WH-1,2.5,${token},NaN\n`;
  const issues = preflightSalesCsv(csv).issues;
  assert.ok(issues.some(issue => issue.code === "missingValue" && issue.column === "sku" && issue.row === 2));
  assert.ok(issues.some(issue => issue.code === "invalidDate" && issue.row === 2));
  assert.deepEqual(issues.filter(issue => issue.code === "invalidNumber").map(issue => issue.column), ["quantity", "unitPrice"]);
});

test("unclosed quotes are rejected", () => {
  assert.deepEqual(preflightSalesCsv(`${header}\n"s-1,2026-01-01`).issues, [{code: "malformedCsv", row: 2}]);
});
