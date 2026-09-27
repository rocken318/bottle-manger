import { describe, expect, it } from 'vitest';
import {
  CLOSING_STOCK_HEADER,
  MONTHLY_HEADER,
  PURCHASE_HEADER,
  VARIANCE_HEADER,
  closingStockCsvRows,
  monthlyCsvRows,
  purchaseCsvRows,
  varianceCsvRows,
} from '@/lib/costs/csvRows';
import type { MonthLine } from '@/lib/costs/report';
import type { MonthlyReportRow, PurchaseDetail, VarianceDetail } from '@/lib/repo/costs';

const purchase = (over: Partial<PurchaseDetail>): PurchaseDetail => ({
  id: 'p1',
  date: '2026-09-03',
  createdAt: new Date('2026-09-03T01:00:00Z'),
  locationId: 'L1',
  locationName: '事務所',
  drinkId: 'D1',
  drinkName: 'コーラ',
  quantity: 24,
  unitCents: 8333,
  staffName: '管理者',
  note: null,
  ...over,
});

describe('cost CSV rows', () => {
  it('monthly rows follow the header', () => {
    const row: MonthlyReportRow = {
      month: '2026-09',
      locationId: null,
      locationName: '全店合計',
      openingYen: 1000,
      purchaseYen: 2000,
      purchaseTaxYen: 200,
      purchaseInclYen: 2200,
      transferInYen: 0,
      transferOutYen: 0,
      varianceYen: -100,
      disposeYen: 300,
      closingYen: 1500,
      cogsYen: 1500,
      lossRate: 100 / 1500,
      missingCount: 1,
      missingDrinkIds: ['D2'],
    };
    const [out] = monthlyCsvRows([row]);
    expect(out).toHaveLength(MONTHLY_HEADER.length);
    expect(out).toEqual(['2026-09', '全店合計', 1000, 2000, 200, 2200, 0, 0, -100, 300, 1500, 1500, '6.7%', 1]);
  });

  it('purchases compute amount and tax per line, and mark missing prices', () => {
    const rows = purchaseCsvRows([purchase({}), purchase({ id: 'p2', unitCents: null, note: 'メモ' })], 10);
    expect(rows[0]).toHaveLength(PURCHASE_HEADER.length);
    // 24 × 83.33 = 1999.92 → 2000円, tax 200
    expect(rows[0]).toEqual(['2026-09-03', '事務所', 'コーラ', 24, '83.33', 2000, 200, 2200, '管理者', null]);
    expect(rows[1]).toEqual(['2026-09-03', '事務所', 'コーラ', 24, '価格未設定', null, null, null, '管理者', 'メモ']);
  });

  it('variance rows carry the signed amount', () => {
    const v: VarianceDetail = {
      id: 'v1',
      createdAt: new Date('2026-09-30T12:00:00Z'),
      locationId: 'L1',
      locationName: 'Kingyo',
      staffName: '店長',
      drinkId: 'D1',
      drinkName: 'コーラ',
      bookQty: 10,
      countedQty: 7,
      diffQty: -3,
      unitCents: 8333,
    };
    const [out] = varianceCsvRows([v]);
    expect(out).toHaveLength(VARIANCE_HEADER.length);
    expect(out.slice(1)).toEqual(['Kingyo', '店長', 'コーラ', 10, 7, -3, '83.33', -250]);
  });

  it('closing stock lists non-zero balances in month, location and drink order', () => {
    const line = (over: Partial<MonthLine>): MonthLine => ({
      locationId: 'L1',
      month: '2026-09',
      drinkId: 'D1',
      openingQty: 0,
      openingUnitCents: null,
      closingQty: 5,
      closingUnitCents: 10000,
      flows: {},
      ...over,
    });
    const rows = closingStockCsvRows(
      [
        line({ locationId: 'L2' }),
        line({}),
        line({ drinkId: 'D2', closingUnitCents: null }),
        line({ month: '2026-08' }),
        line({ drinkId: 'D3', closingQty: 0 }),
      ],
      [
        { id: 'L1', name: '事務所' },
        { id: 'L2', name: 'Kingyo' },
      ],
      [
        { id: 'D1', name: 'コーラ' },
        { id: 'D2', name: 'お茶' },
        { id: 'D3', name: '水' },
      ],
    );
    expect(rows[0]).toHaveLength(CLOSING_STOCK_HEADER.length);
    expect(rows).toEqual([
      ['2026-08', '事務所', 'コーラ', 5, '100.00', 500],
      ['2026-09', '事務所', 'コーラ', 5, '100.00', 500],
      ['2026-09', '事務所', 'お茶', 5, '価格未設定', null],
      ['2026-09', 'Kingyo', 'コーラ', 5, '100.00', 500],
    ]);
  });
});
