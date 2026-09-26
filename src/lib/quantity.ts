export function toBottles(cases: number, bottles: number, unitsPerCase: number): number {
  return cases * unitsPerCase + bottles;
}

export function splitCases(total: number, unitsPerCase: number): { cases: number; bottles: number } {
  // total must be >= 0
  return { cases: Math.floor(total / unitsPerCase), bottles: total % unitsPerCase };
}

export function formatQuantity(total: number, unitsPerCase: number): string {
  if (total < 0) return `計−${-total}本`;
  if (unitsPerCase <= 1 || total < unitsPerCase) return `${total}本`;
  const { cases, bottles } = splitCases(total, unitsPerCase);
  if (bottles === 0) return `${cases}ケース（計${total}本）`;
  return `${cases}ケース＋${bottles}本（計${total}本）`;
}
