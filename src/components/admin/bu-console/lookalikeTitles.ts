/**
 * ADR-273 — look-alike KPI titles in the BU Console.
 *
 * A mis-split KPI text keeps its scoring ladder, incentive note or month
 * brackets inside `kpi_title`, so the console shows it as a separate KPI even
 * though it is the same metric. This module normalises titles far enough to
 * detect that case, without ever merging rows automatically: the console only
 * flags them so an admin can correct the split.
 */

const MONTH_BRACKET =
  /\((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[^)]*\)/g;
const SCORING_TAIL = /(?:=+>?\s*\d|\bscoring\s+logic\b|\bformula\s*:)/;

/** Lower-cased title with scoring ladders, incentive notes and month lists removed. */
export function normalizeConsoleTitle(raw: string | null | undefined): string {
  if (!raw) return '';
  let t = String(raw).toLowerCase();
  const cut = t.search(SCORING_TAIL);
  if (cut > 0) t = t.slice(0, cut);
  t = t.replace(MONTH_BRACKET, ' ');
  t = t.replace(/\(\s*incentive[^)]*\)?/g, ' ');
  t = t.replace(/[^a-z0-9%./ ]+/g, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

export interface LookalikeItem {
  key: string;
  title: string | null | undefined;
}

/**
 * Returns, for each item key, how many items in the same list share its
 * normalised title (1 = unique). Empty titles are never grouped.
 */
export function lookalikeCounts(items: LookalikeItem[]): Map<string, number> {
  const buckets = new Map<string, string[]>();
  for (const item of items) {
    const norm = normalizeConsoleTitle(item.title);
    if (!norm) continue;
    const list = buckets.get(norm);
    if (list) list.push(item.key);
    else buckets.set(norm, [item.key]);
  }
  const counts = new Map<string, number>();
  for (const keys of buckets.values()) {
    if (keys.length < 2) continue;
    for (const key of keys) counts.set(key, keys.length);
  }
  return counts;
}
