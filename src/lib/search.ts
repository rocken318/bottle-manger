/** NFKC (full/half width), lower case, katakana → hiragana, no whitespace, no middle dots. */
export function normalizeForSearch(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/\s+/g, '')
    // Strip middle dots only ('･' becomes '・' after NFKC). Do NOT strip 'ー' (long vowel mark),
    // which is meaningful and must be kept for matching.
    .replace(/[・･]/g, '');
}

export function matchesSearch(name: string, query: string): boolean {
  const q = normalizeForSearch(query);
  return q === '' || normalizeForSearch(name).includes(q);
}
