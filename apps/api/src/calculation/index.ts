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

class RollingQuantiles {
  private readonly values: number[];
  private readonly positions: Map<number, number>;
  private readonly tree: number[];
  count = 0;

  constructor(events: SaleEvent[]) {
    this.values = [...new Set(events.filter(event => event.quantity > 0).map(event => event.quantity))].sort((a, b) => a - b);
    this.positions = new Map(this.values.map((value, index) => [value, index]));
    this.tree = Array(this.values.length + 1).fill(0);
  }

  add(value: number, change: 1 | -1) {
    const index = this.positions.get(value);
    if (index === undefined) throw new CalculationError('CALCULATION_FAILED');
    for (let i = index + 1; i < this.tree.length; i += i & -i) this.tree[i] = this.tree[i]! + change;
    this.count += change;
  }

  private prefix(end: number) {
    let count = 0;
    for (let i = end; i > 0; i -= i & -i) count += this.tree[i]!;
    return count;
  }

  private lowerBound(value: number) {
    let left = 0, right = this.values.length;
    while (left < right) {
      const middle = (left + right) >>> 1;
      if (this.values[middle]! < value) left = middle + 1;
      else right = middle;
    }
    return left;
  }

  private upperBound(value: number) {
    let left = 0, right = this.values.length;
    while (left < right) {
      const middle = (left + right) >>> 1;
      if (this.values[middle]! <= value) left = middle + 1;
      else right = middle;
    }
    return left;
  }

  private kth(position: number) {
    let index = 0, bit = 1;
    while (bit < this.tree.length) bit <<= 1;
    for (bit >>= 1; bit > 0; bit >>= 1) {
      const next = index + bit;
      if (next < this.tree.length && this.tree[next]! < position) {
        position -= this.tree[next]!;
        index = next;
      }
    }
    return this.values[index]!;
  }

  median() {
    if (!this.count) return 0;
    return (this.kth(Math.floor((this.count + 1) / 2)) + this.kth(Math.floor((this.count + 2) / 2))) / 2;
  }

  mad(medianValue: number) {
    if (!this.count) return 0;
    const medianTwice = medianValue * 2;
    const maxRadius = Math.max(Math.abs(this.values[0]! * 2 - medianTwice),
      Math.abs(this.values[this.values.length - 1]! * 2 - medianTwice));
    const radiusAt = (position: number) => {
      let low = 0, high = maxRadius;
      while (low < high) {
        const radius = Math.floor((low + high) / 2);
        const below = this.prefix(this.lowerBound((medianTwice - radius) / 2));
        const through = this.prefix(this.upperBound((medianTwice + radius) / 2));
        if (through - below >= position) high = radius;
        else low = radius + 1;
      }
      return low;
    };
    return (radiusAt(Math.floor((this.count + 1) / 2)) + radiusAt(Math.floor((this.count + 2) / 2))) / 4;
  }
}

export function inspectDemand(scope: DemandScope, signal?: AbortSignal): InspectionWork {
  assertActive(signal);
  const items = scopedItems(scope);
  const skus = new Set(items.map(item => item.sku));
  const events = aggregateEvents(scope, skus);
  const bySku = new Map(items.map(item => [item.sku, [] as SaleEvent[]]));
  for (const event of events) bySku.get(event.sku)!.push(event);
  const candidates: Candidate[] = [];
  const warnings: Warning[] = [];
  for (const item of items) {
    const skuEvents = bySku.get(item.sku)!;
    if (skuEvents.filter(event => event.quantity > 0).length < 8) warnings.push(warning('INSUFFICIENT_HISTORY', item.sku));
    const quantiles = new RollingQuantiles(skuEvents);
    const window: SaleEvent[] = [];
    const customerQuantities = new Map<string, number>();
    let head = 0, windowQuantity = 0;
    for (let index = 0; index < skuEvents.length;) {
      assertActive(signal);
      const date = skuEvents[index]!.date;
      const start = addDays(date, -90);
      while (head < window.length && window[head]!.date < start) {
        const expired = window[head++]!;
        quantiles.add(expired.quantity, -1);
        windowQuantity -= expired.quantity;
        const remaining = customerQuantities.get(expired.customerToken)! - expired.quantity;
        if (remaining) customerQuantities.set(expired.customerToken, remaining);
        else customerQuantities.delete(expired.customerToken);
      }
      let end = index;
      while (end < skuEvents.length && skuEvents[end]!.date === date) end++;
      const today = skuEvents.slice(index, end).filter(event => event.quantity > 0);
      const todayQuantity = today.reduce((sum, event) => sum + event.quantity, 0);
      const todayByCustomer = new Map<string, number>();
      for (const event of today) todayByCustomer.set(event.customerToken,
        (todayByCustomer.get(event.customerToken) ?? 0) + event.quantity);
      for (const event of today) {
        const priorCount = quantiles.count;
        if (!priorCount) continue;
        const m = quantiles.median();
        if (event.quantity <= 6 * m) continue;
        const mad = quantiles.mad(m);
        if (priorCount < 8) {
          if (event.quantity > Math.max(6 * m, m + 6 * mad))
            warnings.push(warning('INSUFFICIENT_HISTORY', item.sku));
          continue;
        }
        if (!(event.quantity > Math.max(6 * m, m + 6 * mad))) continue;
        let recurrenceCount = 0;
        for (let priorIndex = head; priorIndex < window.length; priorIndex++) {
          const other = window[priorIndex]!;
          if (other.customerToken === event.customerToken && other.quantity >= 0.5 * event.quantity &&
              other.quantity <= 2 * event.quantity) recurrenceCount++;
        }
        const total = windowQuantity + todayQuantity;
        const customerTotal = (customerQuantities.get(event.customerToken) ?? 0) +
          (todayByCustomer.get(event.customerToken) ?? 0);
        candidates.push({eventId: event.id, sku: item.sku, date: event.date, quantity: event.quantity,
          medianQuantity: m, madQuantity: mad, priorObservationCount: priorCount, recurrenceCount,
          customerShare90d: total ? customerTotal / total : 0, eventValue: event.value,
          hardOneOff: event.quantity >= 10 * m && recurrenceCount < 3});
        if (candidates.length > 24) throw new CalculationError('CANDIDATE_LIMIT');
      }
      for (const event of today) {
        window.push(event);
        quantiles.add(event.quantity, 1);
        windowQuantity += event.quantity;
        customerQuantities.set(event.customerToken, (customerQuantities.get(event.customerToken) ?? 0) + event.quantity);
      }
      index = end;
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
    const historyStart = epoch(input.historyStart);
    const dayCount = (epoch(input.asOf) - historyStart) / dayMs;
    const stockoutChanges = new Int32Array(dayCount + 1);
    for (const interval of input.stockouts) {
      if (interval.sku !== item.sku || interval.warehouseId !== scope.warehouseId) continue;
      const first = Math.max(0, (epoch(interval.start) - historyStart) / dayMs);
      const afterLast = Math.min(dayCount, (epoch(interval.end) - historyStart) / dayMs + 1);
      if (first < afterLast) { stockoutChanges[first]!++; stockoutChanges[afterLast]!--; }
    }
    const stockoutDays = new Uint8Array(dayCount);
    let activeStockouts = 0;
    for (let index = 0; index < dayCount; index++) {
      const date = dateAt(historyStart + index * dayMs);
      activeStockouts += stockoutChanges[index]!;
      stockoutDays[index] = activeStockouts > 0 ? 1 : 0;
      dates.push(date);
      raw.push(dailyActual.get(date) ?? 0);
    }
    let lostDemandUnits = 0;
    for (let index = 0; index < dayCount; index++) {
      const actual = raw[index]!;
      let corrected = actual;
      if (stockoutDays[index]) {
        const prior: number[] = [];
        for (let previous = Math.max(0, index - 56); previous < index; previous++) {
          if (!stockoutDays[previous]) prior.push(raw[previous]!);
        }
        if (prior.length >= 7) corrected = Math.max(actual, median(prior));
        else itemWarnings.push(warning('INSUFFICIENT_HISTORY', item.sku));
      }
      lostDemandUnits += corrected - actual;
      cleaned.push(corrected);
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
