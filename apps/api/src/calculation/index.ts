import { createHash, randomUUID } from 'node:crypto';
import {
  CalculationSchema, InspectionSchema, validateSpecialistReport,
  type Calculation, type Candidate, type DatasetInput, type Inspection, type SpecialistReport,
  type Warning
} from '@atlas/contracts';

export class CalculationError extends Error {
  constructor(readonly code: 'DATA_GAP' | 'CANDIDATE_LIMIT' | 'CALCULATION_FAILED') { super(code); }
}

export type DemandScope = {input: DatasetInput; warehouseId: string; categoryId: string | null; scopeId: string};
type SaleEvent = {id: string; sku: string; date: string; customerToken: string; quantity: number; value: number};
type InspectionWork = {inspection: Inspection; events: SaleEvent[]};
const dayMs = 86_400_000;
const epoch = (date: string) => Date.parse(`${date}T00:00:00.000Z`);
const dateAt = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const addDays = (date: string, days: number) => dateAt(epoch(date) + days * dayMs);
const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
};
const mean = (values: number[]) => values.length ? values.reduce((sum, n) => sum + n, 0) / values.length : 0;
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
const ceilUnits = (value: number) => Math.ceil(Math.max(0, value) - 16 * Number.EPSILON * Math.max(1, Math.abs(value)));
const warning = (code: Warning['code'], sku: string | null, evidenceIds: string[] = []): Warning => ({code, sku, evidenceIds});
const uniqueWarnings = (items: Warning[]) => [...new Map(items.map(item => [`${item.code}:${item.sku}:${item.evidenceIds.join(',')}`, item])).values()];

function assertActive(signal?: AbortSignal) { if (signal?.aborted) throw new CalculationError('CALCULATION_FAILED'); }
function scopedItems(scope: DemandScope) {
  const {input, warehouseId, categoryId} = scope;
  if (!input.warehouses.some(w => w.id === warehouseId) ||
      (categoryId !== null && !input.categories.some(c => c.id === categoryId))) throw new CalculationError('DATA_GAP');
  const items = input.items.filter(item => categoryId === null || item.categoryId === categoryId);
  if (!items.length) throw new CalculationError('DATA_GAP');
  return items;
}

function aggregateEvents(scope: DemandScope, selectedSkus: Set<string>): SaleEvent[] {
  const byKey = new Map<string, SaleEvent>();
  for (const sale of scope.input.sales) {
    if (sale.warehouseId !== scope.warehouseId || !selectedSkus.has(sale.sku)) continue;
    const key = `${sale.sku}\u0000${sale.date}\u0000${sale.customerToken}`;
    let event = byKey.get(key);
    if (!event) {
      const id = `evt_${createHash('sha256').update(scope.scopeId).update(key).digest('hex').slice(0, 24)}`;
      event = {id, sku: sale.sku, date: sale.date, customerToken: sale.customerToken, quantity: 0, value: 0};
      byKey.set(key, event);
    }
    event.quantity += sale.quantity;
    event.value += sale.quantity * sale.unitPrice;
    if (!Number.isSafeInteger(event.quantity) || !Number.isFinite(event.value)) throw new CalculationError('CALCULATION_FAILED');
  }
  return [...byKey.values()].sort((a, b) => a.date.localeCompare(b.date) || a.sku.localeCompare(b.sku) || a.id.localeCompare(b.id));
}

export function inspectDemand(scope: DemandScope, signal?: AbortSignal): InspectionWork {
  assertActive(signal);
  const items = scopedItems(scope);
  const skus = new Set(items.map(item => item.sku));
  const events = aggregateEvents(scope, skus);
  const candidates: Candidate[] = [];
  const warnings: Warning[] = [];
  for (const item of items) {
    const skuEvents = events.filter(event => event.sku === item.sku);
    if (skuEvents.filter(event => event.quantity > 0).length < 8) warnings.push(warning('INSUFFICIENT_HISTORY', item.sku));
    for (const event of skuEvents) {
      assertActive(signal);
      if (event.quantity <= 0) continue;
      const start = epoch(event.date) - 90 * dayMs;
      const prior = skuEvents.filter(other => other.quantity > 0 && epoch(other.date) >= start && other.date < event.date);
      const quantities = prior.map(other => other.quantity);
      if (quantities.length < 8) {
        if (quantities.length > 0) {
          const sparseMedian = median(quantities);
          const sparseMad = median(quantities.map(value => Math.abs(value - sparseMedian)));
          if (event.quantity > Math.max(6 * sparseMedian, sparseMedian + 6 * sparseMad))
            warnings.push(warning('INSUFFICIENT_HISTORY', item.sku));
        }
        continue;
      }
      const m = median(quantities);
      const mad = median(quantities.map(value => Math.abs(value - m)));
      if (!(event.quantity > Math.max(6 * m, m + 6 * mad))) continue;
      const recurrenceCount = prior.filter(other => other.customerToken === event.customerToken &&
        other.quantity >= 0.5 * event.quantity && other.quantity <= 2 * event.quantity).length;
      const windowEvents = [...prior, ...skuEvents.filter(other => other.date === event.date && other.quantity > 0)];
      const total = windowEvents.reduce((sum, other) => sum + other.quantity, 0);
      const customerTotal = windowEvents.filter(other => other.customerToken === event.customerToken)
        .reduce((sum, other) => sum + other.quantity, 0);
      candidates.push({eventId: event.id, sku: item.sku, date: event.date, quantity: event.quantity,
        medianQuantity: m, madQuantity: mad, priorObservationCount: prior.length, recurrenceCount,
        customerShare90d: total ? customerTotal / total : 0, eventValue: event.value,
        hardOneOff: event.quantity >= 10 * m && recurrenceCount < 3});
      if (candidates.length > 24) throw new CalculationError('CANDIDATE_LIMIT');
    }
  }
  candidates.sort((a, b) => a.date.localeCompare(b.date) || a.sku.localeCompare(b.sku) || a.eventId.localeCompare(b.eventId));
  const input = scope.input;
  const inspection = InspectionSchema.parse({scopeId: scope.scopeId, candidateCount: candidates.length, candidates,
    itemCount: items.length, historyStart: input.historyStart, asOf: input.asOf,
    sourceCounts: {
      sales: input.sales.filter(row => row.warehouseId === scope.warehouseId && skus.has(row.sku)).length,
      stock: input.stock.filter(row => row.warehouseId === scope.warehouseId && skus.has(row.sku)).length,
      stockouts: input.stockouts.filter(row => row.warehouseId === scope.warehouseId && skus.has(row.sku)).length,
      inbound: input.inbound.filter(row => row.warehouseId === scope.warehouseId && skus.has(row.sku)).length,
      items: items.length, suppliers: new Set(items.map(item => item.supplierId)).size,
      categories: new Set(items.map(item => item.categoryId)).size,
      growth: new Set(items.map(item => item.categoryId)).size
    }, warnings: uniqueWarnings(warnings)});
  return {inspection, events};
}

function seasonalFactors(series: number[], dates: string[], asOf: string): {byMonth: number[]; sufficient: boolean} {
  const lastCompleteMonth = new Date(Date.UTC(Number(asOf.slice(0, 4)), Number(asOf.slice(5, 7)) - 1, 0));
  const endExclusive = Date.UTC(lastCompleteMonth.getUTCFullYear(), lastCompleteMonth.getUTCMonth() + 1, 1);
  const start = new Date(Date.UTC(lastCompleteMonth.getUTCFullYear(), lastCompleteMonth.getUTCMonth() - 11, 1));
  const startDate = start.toISOString().slice(0, 10);
  if (!dates.length || dates[0]! > startDate) return {byMonth: Array(12).fill(1), sufficient: false};
  const annual = dates.reduce((sum, date, i) => sum + (epoch(date) >= epoch(startDate) && epoch(date) < endExclusive ? series[i]! : 0), 0);
  const annualDays = (endExclusive - epoch(startDate)) / dayMs;
  if (annual <= 0 || annualDays < 365) return {byMonth: Array(12).fill(1), sufficient: false};
  const annualDaily = annual / annualDays;
  const indices = Array<number>(12).fill(1);
  const weights = Array<number>(12).fill(0);
  for (let offset = 0; offset < 12; offset++) {
    const monthStart = Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + offset, 1);
    const monthEnd = Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + offset + 1, 1);
    const month = new Date(monthStart).getUTCMonth();
    const total = dates.reduce((sum, date, i) => sum + (epoch(date) >= monthStart && epoch(date) < monthEnd ? series[i]! : 0), 0);
    const days = (monthEnd - monthStart) / dayMs;
    indices[month] = clamp((total / days) / annualDaily, 0.25, 4);
    weights[month] = days;
  }
  const weighted = indices.reduce((sum, value, month) => sum + value * weights[month]!, 0) / annualDays;
  return {byMonth: indices.map(value => value / weighted), sufficient: true};
}

function forecast(series: number[], dates: string[], asOf: string, horizonDays: number, growthPct: number,
  sku: string): {baseDaily: number; seasonFactor: number; trendFactor: number; forecastDaily: number; targetUnits: number; warnings: Warning[]} {
  const warnings: Warning[] = [];
  if (series.length < 56) warnings.push(warning('INSUFFICIENT_HISTORY', sku));
  const season = seasonalFactors(series, dates, asOf);
  if (!season.sufficient) warnings.push(warning('INSUFFICIENT_HISTORY', sku));
  const deseasonalized = series.map((value, i) => value / season.byMonth[Number(dates[i]!.slice(5, 7)) - 1]!);
  const recent = deseasonalized.slice(-28);
  const previous = deseasonalized.slice(-56, -28);
  const baseDaily = series.length >= 56 ? mean(recent) : 0;
  const priorDaily = series.length >= 56 ? mean(previous) : 0;
  let trendFactor = 1;
  if (priorDaily > 0) {
    let risingWeeks = 0;
    for (let week = 0; week < 4; week++) {
      if (mean(recent.slice(week * 7, week * 7 + 7)) > mean(previous.slice(week * 7, week * 7 + 7))) risingWeeks++;
    }
    if (risingWeeks >= 3) {
      trendFactor = clamp(baseDaily / priorDaily, 1, 1.5);
      if (baseDaily / priorDaily > 1.5) warnings.push(warning('CAPPED_TREND', sku));
    }
  }
  const futureFactors = Array.from({length: horizonDays}, (_, i) =>
    season.byMonth[new Date(epoch(addDays(asOf, i))).getUTCMonth()]!);
  const seasonFactor = mean(futureFactors);
  const forecastDaily = baseDaily * seasonFactor * trendFactor * (1 + growthPct / 100);
  return {baseDaily, seasonFactor, trendFactor, forecastDaily, targetUnits: forecastDaily * horizonDays, warnings};
}

export function calculateDemand(scope: DemandScope, work: InspectionWork, specialist: SpecialistReport | null,
  signal?: AbortSignal): Calculation {
  assertActive(signal);
  const items = scopedItems(scope);
  const report = specialist ? validateSpecialistReport(specialist, work.inspection.candidates) : null;
  const decisions = new Map(report?.decisions.map(decision => [decision.eventId, decision]) ?? []);
  const eventActions: Calculation['eventActions'] = work.inspection.candidates.map(candidate => {
    const decision = decisions.get(candidate.eventId);
    if (candidate.hardOneOff) return {eventId: candidate.eventId, action: 'exclude', source: 'hard_rule'};
    if (!decision) return {eventId: candidate.eventId, action: 'exclude_pending_review', source: 'degraded_rule'};
    if (decision.label === 'recurring' && decision.confidence >= 0.8 && candidate.recurrenceCount >= 3)
      return {eventId: candidate.eventId, action: 'retain', source: 'brev_gpu'};
    if (decision.label === 'one_off' && decision.confidence >= 0.8)
      return {eventId: candidate.eventId, action: 'exclude', source: 'brev_gpu'};
    return {eventId: candidate.eventId, action: 'exclude_pending_review', source: 'brev_gpu'};
  });
  const excluded = new Set(eventActions.filter(action => action.action !== 'retain').map(action => action.eventId));
  const warnings = [...work.inspection.warnings];
  const lines: Calculation['lines'] = [];
  const input = scope.input;
  for (const item of items) {
    assertActive(signal);
    const supplier = input.suppliers.find(row => row.id === item.supplierId)!;
    const category = input.categories.find(row => row.id === item.categoryId)!;
    const stockRows = input.stock.filter(row => row.sku === item.sku && row.warehouseId === scope.warehouseId && row.date <= input.asOf)
      .sort((a, b) => b.date.localeCompare(a.date));
    if (!stockRows.length) throw new CalculationError('DATA_GAP');
    const latestStock = stockRows[0]!;
    const itemWarnings: Warning[] = [];
    if ((epoch(input.asOf) - epoch(latestStock.date)) / dayMs > 7) itemWarnings.push(warning('STALE_STOCK', item.sku, [`${item.sku}:stock`]));
    const horizonDays = supplier.leadTimeDays + category.reviewDays + category.safetyDays;
    const horizonEnd = addDays(input.asOf, horizonDays);
    let eligibleInbound = 0, laterInbound = 0, overdueInbound = 0;
    for (const inbound of input.inbound.filter(row => row.sku === item.sku && row.warehouseId === scope.warehouseId)) {
      if (inbound.eta < input.asOf) overdueInbound += inbound.quantity;
      else if (inbound.eta < horizonEnd) eligibleInbound += inbound.quantity;
      else laterInbound += inbound.quantity;
    }
    if (overdueInbound > 0) itemWarnings.push(warning('OVERDUE_INBOUND', item.sku, [`${item.sku}:overdueInbound`]));
    const dailyActual = new Map<string, number>();
    let excludedUnits = 0;
    for (const event of work.events.filter(event => event.sku === item.sku)) {
      if (excluded.has(event.id)) { excludedUnits += event.quantity; continue; }
      dailyActual.set(event.date, (dailyActual.get(event.date) ?? 0) + event.quantity);
    }
    const dates: string[] = [], cleaned: number[] = [], raw: number[] = [];
    let lostDemandUnits = 0;
    for (let day = epoch(input.historyStart); day < epoch(input.asOf); day += dayMs) {
      const date = dateAt(day);
      const actual = dailyActual.get(date) ?? 0;
      const isStockout = input.stockouts.some(row => row.sku === item.sku && row.warehouseId === scope.warehouseId &&
        row.start <= date && row.end >= date);
      let corrected = actual;
      if (isStockout) {
        const prior: number[] = [];
        for (let previousDay = day - 56 * dayMs; previousDay < day; previousDay += dayMs) {
          const previousDate = dateAt(previousDay);
          if (previousDate < input.historyStart) continue;
          if (input.stockouts.some(row => row.sku === item.sku && row.warehouseId === scope.warehouseId &&
            row.start <= previousDate && row.end >= previousDate)) continue;
          prior.push(dailyActual.get(previousDate) ?? 0);
        }
        if (prior.length >= 7) corrected = Math.max(actual, median(prior));
        else itemWarnings.push(warning('INSUFFICIENT_HISTORY', item.sku));
      }
      lostDemandUnits += corrected - actual;
      dates.push(date); cleaned.push(corrected); raw.push(actual);
    }
    const result = forecast(cleaned, dates, input.asOf, horizonDays, category.plannedGrowthPct, item.sku);
    const rawResult = forecast(raw, dates, input.asOf, horizonDays, category.plannedGrowthPct, item.sku);
    itemWarnings.push(...result.warnings);
    const recommendedQty = ceilUnits(result.targetUnits - latestStock.quantity - eligibleInbound);
    const rawSalesQty = ceilUnits(rawResult.targetUnits - latestStock.quantity - eligibleInbound);
    const excludedEventIds = eventActions.filter(action => action.action !== 'retain' &&
      work.inspection.candidates.find(candidate => candidate.eventId === action.eventId)?.sku === item.sku)
      .map(action => action.eventId);
    const pending = eventActions.filter(action => action.action === 'exclude_pending_review' &&
      work.inspection.candidates.find(candidate => candidate.eventId === action.eventId)?.sku === item.sku)
      .map(action => action.eventId);
    if (pending.length) itemWarnings.push(warning('ANOMALY_REVIEW', item.sku, pending));
    const unique = uniqueWarnings(itemWarnings);
    warnings.push(...unique);
    lines.push({sku: item.sku, name: item.name, unit: item.unit, supplierId: supplier.id,
      supplierName: supplier.name, recommendedQty, finalQty: recommendedQty, overrideReason: null,
      urgency: recommendedQty === 0 ? 'none' : result.forecastDaily > 0 && latestStock.quantity / result.forecastDaily < supplier.leadTimeDays ? 'high' : 'normal',
      metrics: {baseDaily: result.baseDaily, seasonFactor: result.seasonFactor, trendFactor: result.trendFactor,
        plannedGrowthPct: category.plannedGrowthPct, leadTimeDays: supplier.leadTimeDays, reviewDays: category.reviewDays,
        safetyDays: category.safetyDays, horizonDays, forecastDaily: result.forecastDaily, targetUnits: result.targetUnits,
        stock: latestStock.quantity, eligibleInbound, laterInbound, overdueInbound, lostDemandUnits,
        excludedUnits, rawSalesQty}, excludedEventIds, warnings: unique});
  }
  lines.sort((a, b) => a.supplierId.localeCompare(b.supplierId) || a.sku.localeCompare(b.sku));
  const calculation = {calculationId: `calc_${randomUUID()}`, lines, warnings: uniqueWarnings(warnings),
    candidates: work.inspection.candidates, eventActions};
  try { return CalculationSchema.parse(calculation); }
  catch { throw new CalculationError('CALCULATION_FAILED'); }
}
