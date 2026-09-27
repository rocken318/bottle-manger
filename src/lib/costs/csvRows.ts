// Header and rows of the four cost CSVs (spec 11.4). Amounts are plain numbers so that
// spreadsheets treat them as numbers; unit prices keep their 2 decimals.
import { formatDateTime } from '../dates';
import type { MonthlyReportRow, PurchaseDetail, VarianceDetail } from '../repo/costs';
import { formatCents, lineAmountYen, taxYen } from './money';
import { formatLossRate, type MonthLine } from './report';

type Cell = string | number | null;

export const MISSING_PRICE = '価格未設定';

export const MONTHLY_HEADER = [
  '年月',
  '拠点',
  '月初在庫金額',
  '仕入額（税抜）',
  '仕入消費税',
  '仕入額（税込）',
  '移動入',
  '移動出',
  '棚卸差異金額',
  '月末在庫金額',
  '売上原価',
  'ロス率',
  '価格未設定件数',
];

export function monthlyCsvRows(rows: MonthlyReportRow[]): Cell[][] {
  return rows.map((r) => [
    r.month,
    r.locationName,
    r.openingYen,
    r.purchaseYen,
    r.purchaseTaxYen,
    r.purchaseInclYen,
    r.transferInYen,
    r.transferOutYen,
    r.varianceYen,
    r.closingYen,
    r.cogsYen,
    formatLossRate(r.lossRate),
    r.missingCount,
  ]);
}

export const PURCHASE_HEADER = ['日付', '拠点', 'ボトル', '本数', '単価（税抜）', '金額（税抜）', '消費税', '金額（税込）', '入力者', 'メモ'];

/** One row per receive; tax is computed per line (1円未満切り捨て). */
export function purchaseCsvRows(rows: PurchaseDetail[], taxRate: number): Cell[][] {
  return rows.map((p) => {
    const common = [p.date, p.locationName, p.drinkName, p.quantity];
    if (p.unitCents === null) return [...common, MISSING_PRICE, null, null, null, p.staffName, p.note];
    const amount = lineAmountYen(p.quantity, p.unitCents);
    const tax = taxYen(amount, taxRate);
    return [...common, formatCents(p.unitCents), amount, tax, amount + tax, p.staffName, p.note];
  });
}

export const VARIANCE_HEADER = ['日時', '拠点', '数えた人', 'ボトル', '帳簿本数', '実数', '差異本数', '単価', '差異金額'];

export function varianceCsvRows(rows: VarianceDetail[]): Cell[][] {
  return rows.map((v) => [
    formatDateTime(v.createdAt),
    v.locationName,
    v.staffName,
    v.drinkName,
    v.bookQty,
    v.countedQty,
    v.diffQty,
    v.unitCents === null ? MISSING_PRICE : formatCents(v.unitCents),
    v.unitCents === null ? null : lineAmountYen(v.diffQty, v.unitCents),
  ]);
}

export const CLOSING_STOCK_HEADER = ['年月', '拠点', 'ボトル', '本数', '単価', '金額'];

/** Non-zero month-end balances, ordered by month, then the given location and drink order. */
export function closingStockCsvRows(
  lines: MonthLine[],
  locations: { id: string; name: string }[],
  drinks: { id: string; name: string }[],
): Cell[][] {
  const locOrder = new Map(locations.map((l, i) => [l.id, i]));
  const drinkOrder = new Map(drinks.map((d, i) => [d.id, i]));
  const locName = new Map(locations.map((l) => [l.id, l.name]));
  const drinkName = new Map(drinks.map((d) => [d.id, d.name]));
  return lines
    .filter((l) => l.closingQty !== 0)
    .sort(
      (a, b) =>
        a.month.localeCompare(b.month) ||
        (locOrder.get(a.locationId) ?? 0) - (locOrder.get(b.locationId) ?? 0) ||
        (drinkOrder.get(a.drinkId) ?? 0) - (drinkOrder.get(b.drinkId) ?? 0),
    )
    .map((l) => [
      l.month,
      locName.get(l.locationId) ?? '',
      drinkName.get(l.drinkId) ?? '',
      l.closingQty,
      l.closingUnitCents === null ? MISSING_PRICE : formatCents(l.closingUnitCents),
      l.closingUnitCents === null ? null : lineAmountYen(l.closingQty, l.closingUnitCents),
    ]);
}
