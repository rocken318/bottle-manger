type DrinkSnapshot = { name?: unknown; unitsPerCase?: unknown };

const isSnapshot = (v: unknown): v is DrinkSnapshot => typeof v === 'object' && v !== null;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** "83.33" / "90.00" → "83.33" / "90" (unit costs are stored with 2 decimals). */
const yen = (v: unknown) => (typeof v === 'string' ? v.replace(/\.00$/, '') : String(v));

const SETTING_LABELS: Record<string, [label: string, unit: string]> = {
  taxRate: ['消費税率', '%'],
  varianceQtyThreshold: ['差異の本数', '本'],
  varianceAmountThreshold: ['差異の金額', '円'],
};

/** Short human-readable summary of an audit log entry's details, or null when there is nothing to show. */
export function describeAuditDetails(log: { action: string; details: Record<string, unknown> }): string | null {
  const name = typeof log.details.name === 'string' ? log.details.name : null;
  const { before, after } = log.details;
  if (log.action === 'drink.update' && isSnapshot(before) && isSnapshot(after)) {
    const nameChanged = before.name !== after.name;
    const unitsChange =
      before.unitsPerCase !== after.unitsPerCase
        ? `${before.unitsPerCase}本/ケース → ${after.unitsPerCase}本/ケース`
        : null;
    if (nameChanged) return [`${before.name} → ${after.name}`, unitsChange].filter(Boolean).join('、');
    if (unitsChange) return `${name ?? before.name}（${unitsChange}）`;
  }
  if (log.action.startsWith('price.') && name !== null && typeof log.details.effectiveFrom === 'string') {
    const beforeCost = log.action === 'price.update' && isRecord(before) ? before.unitCost : undefined;
    const change = beforeCost === undefined ? '' : `${yen(beforeCost)}円 → `;
    return `${name} ${log.details.effectiveFrom}から 1本${change}${yen(log.details.unitCost)}円`;
  }
  if (log.action === 'settings.update' && isRecord(before) && isRecord(after)) {
    const parts = Object.keys(after)
      .filter((k) => Object.hasOwn(SETTING_LABELS, k))
      .map((k) => {
        const [label, unit] = SETTING_LABELS[k];
        return `${label} ${before[k]}${unit} → ${after[k]}${unit}`;
      });
    if (parts.length > 0) return parts.join('、');
  }
  return name;
}
