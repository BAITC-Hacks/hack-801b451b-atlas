export const SALES_COLUMNS = ["id", "date", "sku", "warehouseId", "quantity", "customerToken", "unitPrice"] as const;
export type CsvIssueCode = "empty" | "malformedCsv" | "missingColumn" | "duplicateColumn" | "columnCount" |
  "missingValue" | "invalidDate" | "invalidNumber" | "invalidId" | "invalidCustomerToken" |
  "duplicateId" | "duplicateRow" | "tooLarge";
export type CsvIssue = { code: CsvIssueCode; row: number; column?: string; firstRow?: number };
export type CsvPreflight = { dataRows: number; issues: CsvIssue[] };

type CsvRow = { values: string[]; number: number };

function parseCsv(text: string): { rows: CsvRow[]; issue?: CsvIssue } {
  const rows: CsvRow[] = [];
  let values: string[] = [], field = "", line = 1, rowStart = 1;
  let quoted = false, closed = false, atStart = true;
  const finishField = () => { values.push(field); field = ""; atStart = true; closed = false; };
  const finishRow = () => { finishField(); rows.push({ values, number: rowStart }); values = []; rowStart = line; };
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') { field += '"'; i++; }
        else { quoted = false; closed = true; }
      } else if (char === "\r" || char === "\n") {
        if (char === "\r" && source[i + 1] === "\n") i++;
        field += "\n"; line++;
      } else field += char;
    } else if (char === ",") finishField();
    else if (char === "\r" || char === "\n") {
      if (char === "\r" && source[i + 1] === "\n") i++;
      line++; finishRow();
    } else if (char === '"' && atStart) { quoted = true; atStart = false; }
    else if (char === '"' || closed) return { rows, issue: { code: "malformedCsv", row: rowStart } };
    else { field += char; atStart = false; }
  }
  if (quoted) return { rows, issue: { code: "malformedCsv", row: rowStart } };
  if (values.length || field !== "" || closed || !atStart) finishRow();
  return { rows };
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function preflightSalesCsv(text: string): CsvPreflight {
  if (new TextEncoder().encode(text).length > 5 * 1024 * 1024) return { dataRows: 0, issues: [{ code: "tooLarge", row: 1 }] };
  const parsed = parseCsv(text);
  if (parsed.issue) return { dataRows: 0, issues: [parsed.issue] };
  const [header, ...rows] = parsed.rows;
  if (!header || (header.values.length === 1 && !header.values[0])) return { dataRows: 0, issues: [{ code: "empty", row: 1 }] };
  const columns = header.values.map(value => value.trim());
  const issues: CsvIssue[] = [];
  for (const name of SALES_COLUMNS) if (!columns.includes(name)) issues.push({ code: "missingColumn", row: 1, column: name });
  columns.forEach((name, index) => { if (name && columns.indexOf(name) !== index) issues.push({ code: "duplicateColumn", row: 1, column: name }); });
  if (issues.length) return { dataRows: rows.length, issues };
  const index = Object.fromEntries(SALES_COLUMNS.map(name => [name, columns.indexOf(name)])) as Record<typeof SALES_COLUMNS[number], number>;
  const ids = new Map<string, number>(), rowKeys = new Map<string, number>();
  let dataRows = 0;
  for (const row of rows) {
    if (row.values.length === 1 && row.values[0] === "") continue;
    dataRows++;
    if (row.values.length !== columns.length) { issues.push({ code: "columnCount", row: row.number }); continue; }
    for (const name of SALES_COLUMNS) if (!row.values[index[name]]?.trim()) issues.push({ code: "missingValue", row: row.number, column: name });
    const value = (name: typeof SALES_COLUMNS[number]) => row.values[index[name]].trim();
    if (value("date") && !validDate(value("date"))) issues.push({ code: "invalidDate", row: row.number, column: "date" });
    for (const name of ["quantity", "unitPrice"] as const) {
      const raw = value(name), numeric = Number(raw);
      if (raw && (name === "quantity" ? !/^\d+$/.test(raw) || !Number.isSafeInteger(numeric) || numeric > 1_000_000_000
        : !/^(?:\d+)(?:\.\d+)?$/.test(raw) || !Number.isFinite(numeric))) issues.push({ code: "invalidNumber", row: row.number, column: name });
    }
    for (const name of ["id", "sku", "warehouseId"] as const) {
      const raw = value(name);
      if (raw && (!/^[A-Za-z0-9_.:-]{1,80}$/.test(raw) || (name === "sku" && raw.length > 48))) issues.push({ code: "invalidId", row: row.number, column: name });
    }
    if (value("customerToken") && !/^anon_[a-f0-9]{16,64}$/.test(value("customerToken"))) issues.push({ code: "invalidCustomerToken", row: row.number, column: "customerToken" });
    const id = value("id"), firstId = ids.get(id);
    if (id && firstId !== undefined) issues.push({ code: "duplicateId", row: row.number, column: "id", firstRow: firstId });
    else if (id) ids.set(id, row.number);
    const rowKey = JSON.stringify(row.values), firstRow = rowKeys.get(rowKey);
    if (firstRow !== undefined) issues.push({ code: "duplicateRow", row: row.number, firstRow });
    else rowKeys.set(rowKey, row.number);
  }
  if (!dataRows) issues.push({ code: "empty", row: header.number + 1 });
  return { dataRows, issues };
}
