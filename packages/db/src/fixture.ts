import { DatasetInputSchema, type DatasetInput } from '@atlas/contracts';

/** Fixed, synthetic 24-month input. Source labels describe provenance, not a partner 1C layout. */
export function buildSyntheticDataset(): DatasetInput {
  const warehouseId = 'WH_DEMO';
  const definitions = [
    {sku: 'STABLE', name: 'Stable relay', categoryId: 'CAT_STABLE', supplierId: 'SUP_A'},
    {sku: 'SEASONAL', name: 'Seasonal cable', categoryId: 'CAT_OTHER', supplierId: 'SUP_A'},
    {sku: 'GROWING', name: 'Growing switch', categoryId: 'CAT_OTHER', supplierId: 'SUP_B'},
    {sku: 'STOCKOUT', name: 'Stockout socket', categoryId: 'CAT_OTHER', supplierId: 'SUP_B'},
    {sku: 'SPIKE', name: 'Isolated spike fuse', categoryId: 'CAT_OTHER', supplierId: 'SUP_A'},
    {sku: 'BORDERLINE', name: 'Recurring candidate clamp', categoryId: 'CAT_OTHER', supplierId: 'SUP_B'}
  ] as const;
  const customerToken = (n: number) => `anon_${n.toString(16).padStart(16, '0')}`;
  const sales: DatasetInput['sales'] = [];
  for (let monthIndex = 0; monthIndex < 24; monthIndex++) {
    const year = 2024 + Math.floor(monthIndex / 12);
    const month = monthIndex % 12 + 1;
    for (const day of [1, 8, 15, 22]) {
      const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      for (const item of definitions) {
        if (item.sku === 'STOCKOUT') continue;
        const quantity = item.sku === 'STABLE' ? 12
          : item.sku === 'SEASONAL' ? (month >= 5 && month <= 8 ? 28 : 5)
          : item.sku === 'GROWING' ? 5 + monthIndex
          : item.sku === 'SPIKE' ? 8 : 10;
        sales.push({id: `sale_${item.sku}_${monthIndex}_${day}`, date, sku: item.sku, warehouseId,
          quantity, customerToken: customerToken(monthIndex * 4 + day), unitPrice: 100});
      }
    }
  }
  for (let day = new Date('2024-01-01T00:00:00.000Z'); day < new Date('2026-01-01T00:00:00.000Z');
    day = new Date(day.getTime() + 86_400_000)) {
    const date = day.toISOString().slice(0, 10);
    const inStockout = date >= '2025-09-01' && date <= '2025-10-31';
    sales.push({id: `sale_STOCKOUT_${date}`, date, sku: 'STOCKOUT', warehouseId,
      quantity: inStockout ? 0 : 2, customerToken: customerToken(day.getTime() / 86_400_000), unitPrice: 100});
  }
  sales.push({id: 'sale_SPIKE_one_off', date: '2025-09-20', sku: 'SPIKE', warehouseId,
    quantity: 350, customerToken: customerToken(900), unitPrice: 100});
  for (const [i, date] of ['2025-08-29', '2025-09-27', '2025-10-25', '2025-11-22'].entries()) {
    sales.push({id: `sale_BORDERLINE_repeat_${i}`, date,
      sku: 'BORDERLINE', warehouseId, quantity: 65, customerToken: customerToken(901), unitPrice: 100});
  }
  return DatasetInputSchema.parse({
    schemaVersion: '1', label: 'Synthetic 24-month replenishment demo v4', kind: 'synthetic', currency: 'KZT',
    historyStart: '2024-01-01', asOf: '2026-01-01', privacyConfirmed: true,
    sources: {sales: 'synthetic fixture sales', stock: 'synthetic fixture stock', stockouts: 'synthetic fixture stockouts',
      suppliers: 'synthetic fixture suppliers', materialStatement: 'synthetic normalized items and stock',
      inbound: 'synthetic fixture inbound', categories: 'synthetic fixture categories', growth: 'synthetic fixture category growth'},
    warehouses: [{id: warehouseId, name: 'Demo warehouse'}],
    suppliers: [{id: 'SUP_A', name: 'Supplier A', leadTimeDays: 14}, {id: 'SUP_B', name: 'Supplier B', leadTimeDays: 21}],
    categories: [
      {id: 'CAT_STABLE', name: 'Stable category', reviewDays: 14, safetyDays: 7, plannedGrowthPct: 0},
      {id: 'CAT_OTHER', name: 'Other electrical goods', reviewDays: 14, safetyDays: 7, plannedGrowthPct: 5}
    ],
    items: definitions.map(({sku, name, categoryId, supplierId}) => ({sku, name, unit: 'pcs', categoryId, supplierId})),
    sales,
    stock: definitions.map(({sku}) => ({date: '2025-12-31', sku, warehouseId, quantity: sku === 'STOCKOUT' ? 1 : 6})),
    stockouts: [{sku: 'STOCKOUT', warehouseId, start: '2025-09-01', end: '2025-10-31'}],
    inbound: [{id: 'inbound_STABLE', sku: 'STABLE', warehouseId, quantity: 5, eta: '2026-01-08'},
      {id: 'inbound_GROWING', sku: 'GROWING', warehouseId, quantity: 3, eta: '2026-01-15'}]
  });
}
