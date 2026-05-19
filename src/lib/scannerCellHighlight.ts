/**
 * Helpers used by the Build Registry drill-in table (AffectedKpisTable) to
 * highlight per-row outliers within a single loaded page.
 *
 * A cell is considered an "outlier" when:
 *   - its value is non-empty, AND
 *   - the column contains at least 2 distinct non-empty values across the
 *     loaded page, AND
 *   - the value differs from the column's mode (most common value).
 *
 * All comparisons are case-insensitive, trim-tolerant.
 */

function normalize(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

/**
 * Mode (most common value) across a list of strings, ignoring null/empty.
 * Ties resolved by first-seen for determinism.
 */
export function modeValue(values: Array<string | null | undefined>): string | null {
  const counts = new Map<string, { n: number; first: number; original: string }>();
  values.forEach((v, idx) => {
    const s = normalize(v);
    if (!s) return;
    const k = s.toLowerCase();
    const existing = counts.get(k);
    if (existing) {
      existing.n += 1;
    } else {
      counts.set(k, { n: 1, first: idx, original: s });
    }
  });
  let best: { n: number; first: number; original: string } | null = null;
  counts.forEach(entry => {
    if (!best || entry.n > best.n || (entry.n === best.n && entry.first < best.first)) {
      best = entry;
    }
  });
  return best ? best.original : null;
}

/**
 * Compute mode value per requested key across a list of row objects.
 */
export function pageModes<K extends string>(
  rows: Array<Record<string, unknown>>,
  keys: readonly K[],
): Record<K, string | null> {
  const out = {} as Record<K, string | null>;
  for (const k of keys) {
    out[k] = modeValue(rows.map(r => r[k] as string | null | undefined));
  }
  return out;
}

/**
 * Returns true when a column has 2+ distinct non-empty values across the page.
 * Used to suppress outlier highlighting on uniform columns.
 */
export function columnHasVariety(values: Array<string | null | undefined>): boolean {
  const set = new Set<string>();
  for (const v of values) {
    const s = normalize(v).toLowerCase();
    if (s) set.add(s);
    if (set.size >= 2) return true;
  }
  return false;
}

/**
 * True when `value` should be highlighted as an outlier for its column.
 */
export function isOutlier(
  value: string | null | undefined,
  mode: string | null,
  hasVariety: boolean,
): boolean {
  if (!hasVariety) return false;
  const v = normalize(value);
  if (!v) return false;
  if (!mode) return false;
  return v.toLowerCase() !== mode.toLowerCase();
}
