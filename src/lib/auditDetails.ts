type DrinkSnapshot = { name?: unknown; unitsPerCase?: unknown };

const isSnapshot = (v: unknown): v is DrinkSnapshot => typeof v === 'object' && v !== null;

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
  return name;
}
