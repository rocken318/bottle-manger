/** NFKC (full/half width), lower case, katakana → hiragana, no whitespace. */
export function normalizeForSearch(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/\s+/g, '');
}

export function matchesSearch(name: string, query: string): boolean {
  const q = normalizeForSearch(query);
  return q === '' || normalizeForSearch(name).includes(q);
}
