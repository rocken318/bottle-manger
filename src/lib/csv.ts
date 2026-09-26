type Cell = string | number | null | undefined;

function escapeCell(value: Cell): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  // Prevent CSV injection: a text cell starting with = + - @ (optionally after a tab/CR that
  // some spreadsheet apps skip over) would run as a formula in Excel.
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** UTF-8 with BOM and CRLF so that Excel opens Japanese text correctly. */
export function toCsv(header: string[], rows: Cell[][]): string {
  return '\uFEFF' + [header, ...rows].map((row) => row.map(escapeCell).join(',')).join('\r\n') + '\r\n';
}
