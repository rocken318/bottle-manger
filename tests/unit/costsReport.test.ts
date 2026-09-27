import { describe, expect, it } from 'vitest';
import {
  isVarianceFlagged,
  lineAmounts,
  lossRate,
  rankVarianceByDrink,
  summarize,
  type MonthLine,
} from '@/lib/costs/report';

const line = (over: Partial<MonthLine>): MonthLine => ({
  locationId: 'L1',
  month: '2026-04',
  drinkId: 'D1',
  openingQty: 0,
  openingUnitCents: null,
  closingQty: 0,
  closingUnitCents: null,
  flows: {},
  ...over,
});

describe('lineAmounts', () => {
  it('values each component and rounds per line', () => {
    const a = lineAmounts(
      line({
        openingQty: 10,
        openingUnitCents: 8333,
        closingQty: 7,
        closingUnitCents: 9000,
        flows: {
          receive: { qty: 3, amountCents: 3 * 8333, missing: false },
          transfer_in: { qty: 1, amountCents: 8333, missing: false },
          transfer_out: { qty: 2, amountCents: 2 * 8333, missing: false },
          adjust: { qty: -1, amountCents: -8350, missing: false },
        },
      }),
    );
    expect(a).toEqual({
      openingYen: 833, // 833.30
      purchaseYen: 250, // 249.99
      transferInYen: 83,
      transferOutYen: 167, // 166.66
      varianceYen: -84, // -83.50
      disposeYen: 0,
      closingYen: 630,
    });
  });

  it('ignores missing prices when the quantity is zero', () => {
    expect(lineAmounts(line({ openingQty: 0, closingQty: 5, closingUnitCents: 10000 }))).toMatchObject({
      openingYen: 0,
      closingYen: 500,
    });
  });

  it('returns null when any non-zero component has no price', () => {
    expect(lineAmounts(line({ openingQty: 5, closingQty: 5, closingUnitCents: 100 }))).toBeNull();
    expect(lineAmounts(line({ closingQty: 5, closingUnitCents: null }))).toBeNull();
    expect(
      lineAmounts(
        line({ closingQty: 5, closingUnitCents: 100, flows: { receive: { qty: 5, amountCents: 0, missing: true } } }),
      ),
    ).toBeNull();
  });
});

describe('lossRate', () => {
  it('is -variance / COGS', () => {
    expect(lossRate(-50, 1000)).toBeCloseTo(0.05);
    expect(lossRate(20, 1000)).toBeCloseTo(-0.02);
  });
  it('is blank when COGS is zero or negative', () => {
    expect(lossRate(-50, 0)).toBeNull();
    expect(lossRate(-50, -10)).toBeNull();
  });
});

describe('summarize', () => {
  it('adds up lines, computes tax, COGS and loss rate, and counts missing prices', () => {
    const lines = [
      line({
        drinkId: 'D1',
        openingQty: 10,
        openingUnitCents: 10000,
        closingQty: 5,
        closingUnitCents: 12000,
        flows: {
          receive: { qty: 24, amountCents: 24 * 10050, missing: false }, // 2412
          adjust: { qty: -2, amountCents: -2 * 11000, missing: false }, // -220
          transfer_out: { qty: 3, amountCents: 3 * 10000, missing: false }, // 300
        },
      }),
      line({ drinkId: 'D2', closingQty: 4, closingUnitCents: null }),
      line({ drinkId: 'D3', openingQty: 2, openingUnitCents: 5000, closingQty: 2, closingUnitCents: 5000 }),
    ];
    const s = summarize('2026-04', 'L1', lines, 10);
    expect(s).toEqual({
      month: '2026-04',
      locationId: 'L1',
      openingYen: 1000 + 100,
      purchaseYen: 2412,
      purchaseTaxYen: 241,
      purchaseInclYen: 2653,
      transferInYen: 0,
      transferOutYen: 300,
      varianceYen: -220,
      disposeYen: 0,
      closingYen: 600 + 100,
      cogsYen: 1100 + 2412 + 0 - 300 - 700,
      lossRate: 220 / 2512,
      missingCount: 1,
      missingDrinkIds: ['D2'],
    });
  });

  it('computes the tax on the combined total (not per location)', () => {
    const mk = (loc: string) =>
      line({ locationId: loc, closingQty: 1, closingUnitCents: 1500, flows: { receive: { qty: 1, amountCents: 1500, missing: false } } });
    const total = summarize('2026-04', null, [mk('L1'), mk('L2')], 10);
    expect(total.purchaseYen).toBe(30);
    expect(total.purchaseTaxYen).toBe(3);
    expect(summarize('2026-04', 'L1', [mk('L1')], 10).purchaseTaxYen).toBe(1);
  });

  it('counts the same drink missing at two locations twice but lists it once', () => {
    const lines = [
      line({ locationId: 'L1', closingQty: 1 }),
      line({ locationId: 'L2', closingQty: 1 }),
    ];
    expect(summarize('2026-04', null, lines, 10)).toMatchObject({ missingCount: 2, missingDrinkIds: ['D1'] });
  });
});

describe('isVarianceFlagged', () => {
  const t = { qty: 5, amount: 3000 };
  it('flags by quantity or amount (absolute values, inclusive)', () => {
    expect(isVarianceFlagged(-5, 100, t)).toBe(true);
    expect(isVarianceFlagged(4, -3000, t)).toBe(true);
    expect(isVarianceFlagged(4, 2999, t)).toBe(false);
    expect(isVarianceFlagged(-4, null, t)).toBe(false);
    expect(isVarianceFlagged(6, null, t)).toBe(true);
  });
});

describe('rankVarianceByDrink', () => {
  it('sums per drink and sorts by the largest absolute amount, then quantity', () => {
    const r = rankVarianceByDrink([
      { drinkId: 'A', drinkName: 'A', diffQty: -1, amountYen: -100 },
      { drinkId: 'B', drinkName: 'B', diffQty: -3, amountYen: -500 },
      { drinkId: 'A', drinkName: 'A', diffQty: -2, amountYen: -200 },
      { drinkId: 'C', drinkName: 'C', diffQty: 8, amountYen: null },
      { drinkId: 'D', drinkName: 'D', diffQty: 0, amountYen: 0 },
    ]);
    expect(r).toEqual([
      { drinkId: 'B', drinkName: 'B', count: 1, diffQty: -3, amountYen: -500, missingCount: 0 },
      { drinkId: 'A', drinkName: 'A', count: 2, diffQty: -3, amountYen: -300, missingCount: 0 },
      { drinkId: 'C', drinkName: 'C', count: 1, diffQty: 8, amountYen: 0, missingCount: 1 },
      { drinkId: 'D', drinkName: 'D', count: 1, diffQty: 0, amountYen: 0, missingCount: 0 },
    ]);
  });
});

describe('破損・廃棄 in the monthly summary', () => {
  it('shows disposals as 廃棄額, inside COGS but outside the loss rate', () => {
    // 10 bottles at 100円: 2 broken, 1 lost (stocktake −1), 7 left.
    const l = line({
      openingQty: 10,
      openingUnitCents: 10000,
      closingQty: 7,
      closingUnitCents: 10000,
      flows: {
        dispose: { qty: 2, amountCents: 20000, missing: false },
        adjust: { qty: -1, amountCents: -10000, missing: false },
      },
    });
    const s = summarize('2026-10', 'L1', [l], 10);
    expect(s.disposeYen).toBe(200);
    expect(s.varianceYen).toBe(-100);
    expect(s.cogsYen).toBe(1000 - 700);
    expect(s.lossRate).toBeCloseTo(100 / 300);
  });
  it('leaves the line out when a disposal has no price', () => {
    expect(lineAmounts(line({ flows: { dispose: { qty: 1, amountCents: 0, missing: true } } }))).toBeNull();
  });
});
