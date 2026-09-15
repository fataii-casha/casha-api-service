/** Classic Levenshtein edit-distance between two strings. */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  if (m === 0) return n;
  if (n === 0) return m;

  const prevRow = new Array(n + 1).fill(0).map((_, j) => j);
  let currRow = new Array(n + 1).fill(0);

  for (let i = 1; i <= m; i++) {
    currRow[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currRow[j] = Math.min(
        prevRow[j] + 1, // deletion
        currRow[j - 1] + 1, // insertion
        prevRow[j - 1] + cost, // substitution
      );
    }
    for (let j = 0; j <= n; j++) prevRow[j] = currRow[j];
  }

  return prevRow[n];
}

/**
 * Similarity as a 0–1 ratio (1 = identical). Case-insensitive, trims whitespace.
 * Used to fuzzy-match names against BVN provider data where spelling/spacing
 * differences are common but shouldn't hard-fail verification.
 */
export function nameSimilarity(a?: string | null, b?: string | null): number {
  if (!a || !b) return 0;

  const normalizedA = a.trim().toLowerCase();
  const normalizedB = b.trim().toLowerCase();

  if (normalizedA === normalizedB) return 1;

  const maxLen = Math.max(normalizedA.length, normalizedB.length);
  if (maxLen === 0) return 1;

  const distance = levenshteinDistance(normalizedA, normalizedB);
  return 1 - distance / maxLen;
}

export function isFuzzyNameMatch(a?: string | null, b?: string | null, threshold = 0.8): boolean {
  return nameSimilarity(a, b) >= threshold;
}
