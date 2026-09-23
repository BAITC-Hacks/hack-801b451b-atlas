import { OrderQuoteSchema, QuoteRunBodySchema, type OrderQuote } from '@atlas/contracts';
import { NotFoundError, RevisionConflictError, type Db } from '@atlas/db';
import { OrderInputError } from './index.js';

const MAX_SAFE_MINOR = BigInt(Number.MAX_SAFE_INTEGER);

/** Read-only quote using operator purchase prices and the current stored run revision. */
export async function quoteRun(db: Db, runId: string, value: unknown): Promise<OrderQuote> {
  const body = QuoteRunBodySchema.parse(value);
  const run = await db.getRun(runId);
  if (!run) throw new NotFoundError();
  if (run.revision !== body.expectedRevision) throw new RevisionConflictError();
  const dataset = await db.getDataset(run.datasetId);
  if (!dataset || dataset.summary.hash !== run.datasetHash) throw new Error('Stored dataset mismatch');
  const currency = dataset.input.currency;
  if (body.currency && body.currency.toUpperCase() !== currency.toUpperCase()) {
    throw new OrderInputError([{path: 'currency', code: 'CURRENCY_MISMATCH'}]);
  }

  const lineSkus = new Set(run.lines.map(line => line.sku));
  const unknownIndex = body.prices.findIndex(price => !lineSkus.has(price.sku));
  if (unknownIndex !== -1) {
    throw new OrderInputError([{path: `prices.${unknownIndex}.sku`, code: 'UNKNOWN_SKU'}]);
  }
  const priceBySku = new Map(body.prices.map(price => [price.sku, price.unitPriceMinor]));
  let total = 0n;
  const lines = run.lines.map(line => {
    const unitPriceMinor = priceBySku.get(line.sku);
    if (line.finalQty > 0 && unitPriceMinor === undefined) {
      throw new OrderInputError([{path: 'prices', code: 'MISSING_ORDERED_SKU_PRICE'}]);
    }
    const lineTotal = BigInt(line.finalQty) * BigInt(unitPriceMinor ?? 0);
    total += lineTotal;
    if (lineTotal > MAX_SAFE_MINOR || total > MAX_SAFE_MINOR) {
      throw new OrderInputError([{path: 'prices', code: 'UNSAFE_TOTAL'}]);
    }
    return {sku: line.sku, finalQty: line.finalQty,
      unitPriceMinor: unitPriceMinor ?? null, lineTotalMinor: Number(lineTotal)};
  });
  const budget = body.budgetMinor;
  const remaining = budget === undefined ? null : Number(BigInt(budget) > total ? BigInt(budget) - total : 0n);
  const overage = budget === undefined ? null : Number(total > BigInt(budget) ? total - BigInt(budget) : 0n);
  return OrderQuoteSchema.parse({
    runId: run.id, revision: run.revision, currency, lines, totalMinor: Number(total),
    budgetMinor: budget ?? null, remainingMinor: remaining, overageMinor: overage,
    withinBudget: budget === undefined ? null : total <= BigInt(budget)
  });
}
