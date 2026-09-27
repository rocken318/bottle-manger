// Pure aggregation for the monthly cost report (spec 11.2). The SQL in repo/costs.ts produces one
// MonthLine per (location, month, drink); everything here turns those into yen.
import { centsToYen, lineAmountYen, taxYen } from './money';

export type FlowKind = 'receive' | 'transfer_in' | 'transfer_out' | 'adjust' | 'dispose';

export interface Flow {
  /** Bottles (transfer_out and dispose counted positive; adjust is signed). */
  qty: number;
  /** Σ bottles × price on each movement's JST date, over the movements that have a price. */
  amountCents: number;
  /** True when a movement with a non-zero quantity had no price on its date. */
  missing: boolean;
}

export interface MonthLine {
  locationId: string;
  month: string;
  drinkId: string;
  openingQty: number;
  /** Price on the first day of the month (null = 価格未設定). */
  openingUnitCents: number | null;
  closingQty: number;
  /** Price on the last day of the month. */
  closingUnitCents: number | null;
  flows: Partial<Record<FlowKind, Flow>>;
}

export interface LineAmounts {
  openingYen: number;
  purchaseYen: number;
  transferInYen: number;
  transferOutYen: number;
  varianceYen: number;
  /** 破損・廃棄. Part of COGS (it lowers the closing stock) but not of the loss rate. */
  disposeYen: number;
  closingYen: number;
}

export interface MonthlySummary extends LineAmounts {
  month: string;
  /** null for the 全店合計 row. */
  locationId: string | null;
  purchaseTaxYen: number;
  purchaseInclYen: number;
  cogsYen: number;
  /** −variance / COGS as a ratio (0.05 = 5%); null when COGS <= 0. */
  lossRate: number | null;
  /** Number of (location, drink) lines left out because a needed price is not set. */
  missingCount: number;
  missingDrinkIds: string[];
}

const balanceYen = (qty: number, unitCents: number | null): number | null => {
  if (qty === 0) return 0;
  return unitCents === null ? null : lineAmountYen(qty, unitCents);
};

const flowYen = (flow: Flow | undefined): number | null => {
  if (!flow) return 0;
  return flow.missing ? null : centsToYen(flow.amountCents);
};

/**
 * Yen amounts of one drink line, each rounded to 1 yen. Returns null when any component with a
 * non-zero quantity has no price: the whole line is then left out of the amounts (価格未設定) so
 * that COGS is never computed from a partial line.
 */
export function lineAmounts(line: MonthLine): LineAmounts | null {
  const values = {
    openingYen: balanceYen(line.openingQty, line.openingUnitCents),
    purchaseYen: flowYen(line.flows.receive),
    transferInYen: flowYen(line.flows.transfer_in),
    transferOutYen: flowYen(line.flows.transfer_out),
    varianceYen: flowYen(line.flows.adjust),
    disposeYen: flowYen(line.flows.dispose),
    closingYen: balanceYen(line.closingQty, line.closingUnitCents),
  };
  if (Object.values(values).some((v) => v === null)) return null;
  return values as LineAmounts;
}

export function lossRate(varianceYen: number, cogsYen: number): number | null {
  if (cogsYen <= 0) return null;
  const r = -varianceYen / cogsYen;
  return r === 0 ? 0 : r;
}

/** Adds up the lines of one month (for one location, or all of them when locationId is null). */
export function summarize(month: string, locationId: string | null, lines: MonthLine[], taxRate: number): MonthlySummary {
  const sum: LineAmounts = {
    openingYen: 0,
    purchaseYen: 0,
    transferInYen: 0,
    transferOutYen: 0,
    varianceYen: 0,
    disposeYen: 0,
    closingYen: 0,
  };
  let missingCount = 0;
  const missingDrinkIds: string[] = [];
  for (const line of lines) {
    const a = lineAmounts(line);
    if (!a) {
      missingCount++;
      if (!missingDrinkIds.includes(line.drinkId)) missingDrinkIds.push(line.drinkId);
      continue;
    }
    for (const k of Object.keys(sum) as (keyof LineAmounts)[]) sum[k] += a[k];
  }
  const purchaseTaxYen = taxYen(sum.purchaseYen, taxRate);
  const cogsYen = sum.openingYen + sum.purchaseYen + sum.transferInYen - sum.transferOutYen - sum.closingYen;
  return {
    month,
    locationId,
    ...sum,
    purchaseTaxYen,
    purchaseInclYen: sum.purchaseYen + purchaseTaxYen,
    cogsYen,
    lossRate: lossRate(sum.varianceYen, cogsYen),
    missingCount,
    missingDrinkIds,
  };
}

const lineHasActivity = (l: MonthLine) =>
  l.openingQty !== 0 || l.closingQty !== 0 || Object.values(l.flows).some((f) => f && f.qty !== 0);

/**
 * One row per (month, location) plus a 全店合計 row per month when `includeTotal`.
 * Active locations always get a row; inactive ones only when they have stock or movements that month.
 */
export function buildMonthlyRows(input: {
  months: string[];
  locations: { id: string; isActive: boolean }[];
  lines: MonthLine[];
  taxRate: number;
  includeTotal: boolean;
}): MonthlySummary[] {
  const rows: MonthlySummary[] = [];
  for (const month of input.months) {
    const monthLines = input.lines.filter((l) => l.month === month);
    for (const loc of input.locations) {
      const locLines = monthLines.filter((l) => l.locationId === loc.id);
      if (!loc.isActive && !locLines.some(lineHasActivity)) continue;
      rows.push(summarize(month, loc.id, locLines, input.taxRate));
    }
    if (input.includeTotal) {
      const shown = new Set(input.locations.map((l) => l.id));
      rows.push(summarize(month, null, monthLines.filter((l) => shown.has(l.locationId)), input.taxRate));
    }
  }
  return rows;
}

export interface VarianceThresholds {
  qty: number;
  amount: number;
}

/** A stocktake line stands out when |bottles| or |yen| reaches its threshold. */
export function isVarianceFlagged(diffQty: number, amountYen: number | null, t: VarianceThresholds): boolean {
  return Math.abs(diffQty) >= t.qty || (amountYen !== null && Math.abs(amountYen) >= t.amount);
}

export interface DrinkVariance {
  drinkId: string;
  drinkName: string;
  count: number;
  diffQty: number;
  /** Sum over the stocktakes that have a price. */
  amountYen: number;
  /** Stocktakes with a non-zero difference but no price. */
  missingCount: number;
}

/** Differences summed per drink, largest |amount| first, then largest |bottles|. */
export function rankVarianceByDrink(
  rows: { drinkId: string; drinkName: string; diffQty: number; amountYen: number | null }[],
): DrinkVariance[] {
  const byDrink = new Map<string, DrinkVariance>();
  for (const r of rows) {
    const v = byDrink.get(r.drinkId) ?? {
      drinkId: r.drinkId,
      drinkName: r.drinkName,
      count: 0,
      diffQty: 0,
      amountYen: 0,
      missingCount: 0,
    };
    v.count++;
    v.diffQty += r.diffQty;
    if (r.amountYen === null) {
      if (r.diffQty !== 0) v.missingCount++;
    } else {
      v.amountYen += r.amountYen;
    }
    byDrink.set(r.drinkId, v);
  }
  return [...byDrink.values()].sort(
    (a, b) =>
      Math.abs(b.amountYen) - Math.abs(a.amountYen) ||
      Math.abs(b.diffQty) - Math.abs(a.diffQty) ||
      a.drinkName.localeCompare(b.drinkName, 'ja'),
  );
}

/** Loss rate for display: "5.0%" (blank when null). */
export function formatLossRate(rate: number | null): string {
  return rate === null ? '' : `${(rate * 100).toFixed(1)}%`;
}
