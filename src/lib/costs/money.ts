// Money helpers. Prices are kept as integer cents (1/100 yen) in TypeScript so that
// no floating point rounding creeps into the yen amounts.

const DECIMAL_PATTERN = /^(-)?(\d+)(?:\.(\d+))?$/;

/**
 * Parses a numeric value from the database (postgres.js and PGlite both return `numeric`
 * as a string) into integer cents. Throws if it has non-zero digits below 1/100 yen.
 */
export function parseCents(value: string | number): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`invalid amount: ${value}`);
    return Math.round(value * 100);
  }
  const m = DECIMAL_PATTERN.exec(value.trim());
  if (!m) throw new Error(`invalid amount: ${value}`);
  const [, minus, int, frac = ''] = m;
  if (/[1-9]/.test(frac.slice(2))) throw new Error(`amount has more than 2 decimals: ${value}`);
  const cents = Number(int) * 100 + Number(frac.slice(0, 2).padEnd(2, '0'));
  return minus && cents !== 0 ? -cents : cents;
}

/** Rounds cents to whole yen, half up (away from zero for negative amounts, i.e. 四捨五入). */
export function centsToYen(cents: number): number {
  const yen = Math.floor((Math.abs(cents) + 50) / 100);
  return cents < 0 && yen !== 0 ? -yen : yen;
}

/** Amount of one line (quantity × unit cost), rounded to yen once. */
export function lineAmountYen(quantity: number, unitCents: number): number {
  return centsToYen(quantity * unitCents);
}

/** Consumption tax on a tax-excluded amount: amount × rate%, truncated below one yen. */
export function taxYen(amountYen: number, ratePercent: number): number {
  const basisPoints = Math.round(ratePercent * 100);
  const tax = Math.trunc((amountYen * basisPoints) / 10000);
  return tax === 0 ? 0 : tax;
}

/** Per-bottle price from a case price: divided by the units per case, rounded to 1/100 yen (half up). */
export function casePriceToUnitCents(caseCents: number, unitsPerCase: number): number {
  return Math.floor((2 * caseCents + unitsPerCase) / (2 * unitsPerCase));
}

/**
 * Parses what an admin typed as a price (yen, optionally with up to 2 decimals and thousands
 * separators; full-width digits allowed). Returns cents, or null when it is not a valid
 * non-negative amount.
 */
export function parseMoneyInput(input: string): number | null {
  const s = input
    .trim()
    .replace(/[０-９．，]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return parseCents(s);
}

/** Cents as a plain decimal string with 2 decimals (the form stored in numeric(12,2)). */
export function formatCents(cents: number): string {
  const abs = Math.abs(cents);
  const s = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  return cents < 0 ? `-${s}` : s;
}

const yenFormat = new Intl.NumberFormat('ja-JP');

export function formatYen(yen: number): string {
  return yenFormat.format(yen);
}

/** A unit price for display: "83.33" or "120" (no trailing .00). */
export function formatUnitPrice(cents: number): string {
  return cents % 100 === 0 ? formatYen(cents / 100) : `${formatYen(Math.trunc(cents / 100))}.${String(Math.abs(cents) % 100).padStart(2, '0')}`;
}
