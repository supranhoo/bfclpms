/**
 * Pure helpers for Excel-style per-column filtering used by
 * `AffectedKpisTable` in KPI Standardization → Build Registry.
 *
 * - A column whose Set is missing (or empty) in `filters` means "no filter".
 * - Within a single column, checked values are OR-joined.
 * - Across columns, filters are AND-joined.
 * - The sentinel `BLANK_TOKEN` matches null / undefined / whitespace-only cells.
 * - All comparisons are case-insensitive, trim-tolerant.
 */

export const BLANK_TOKEN = '__BLANK__';

export function normalizeCell(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

export function cellToken(v: unknown): string {
  const s = normalizeCell(v);
  return s ? s.toLowerCase() : BLANK_TOKEN;
}

export type ColumnFilters<K extends string = string> = Partial<
  Record<K, Set<string>>
>;

/**
 * Get distinct token+display pairs for a column across the full data set.
 * Display preserves the first-seen original casing.
 */
export function distinctValues(
  rows: Array<Record<string, unknown>>,
  key: string,
): Array<{ token: string; display: string }> {
  const map = new Map<string, string>();
  for (const r of rows) {
    const raw = r[key];
    const tok = cellToken(raw);
    if (!map.has(tok)) {
      map.set(tok, tok === BLANK_TOKEN ? '(Blanks)' : normalizeCell(raw));
    }
  }
  return Array.from(map.entries())
    .map(([token, display]) => ({ token, display }))
    .sort((a, b) => {
      if (a.token === BLANK_TOKEN) return 1;
      if (b.token === BLANK_TOKEN) return -1;
      return a.display.localeCompare(b.display, undefined, { numeric: true });
    });
}

export function applyColumnFilters<R extends Record<string, unknown>>(
  rows: R[],
  filters: ColumnFilters,
): R[] {
  const active = Object.entries(filters).filter(
    ([, set]) => set && set.size > 0,
  ) as Array<[string, Set<string>]>;
  if (active.length === 0) return rows;
  return rows.filter(r =>
    active.every(([key, set]) => set.has(cellToken(r[key]))),
  );
}

export function hasActiveFilter(filters: ColumnFilters): number {
  let n = 0;
  for (const set of Object.values(filters)) {
    if (set && set.size > 0) n += 1;
  }
  return n;
}