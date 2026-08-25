/**
 * ADR-313 — bulk triage model for the duplicate-KPI merge queue.
 *
 * The scanner files one proposal per (canonical, variant) pair. Reviewing
 * pairs one by one does not scale, so this module:
 *   1. groups pairs that resolve to the same canonical KPI,
 *   2. classifies each group as "safe" (identical once the description /
 *      formula / scoring tail is stripped) or "needs judgement",
 *   3. suggests the canonical title to keep.
 *
 * Nothing here writes: it only decides what an admin may safely batch.
 */
import { normalizeConsoleTitle } from './lookalikeTitles';

export interface MergeProposalLike {
  id: string;
  category_id?: string | null;
  canonical_kra_name: string;
  canonical_kpi_name: string;
  variant_kra_name: string;
  variant_kpi_name: string;
  match_type: string;
  similarity?: number | string | null;
  affected_kpi_count: number;
  affected_employee_count: number;
}

export type TriageClass = 'safe' | 'judgement';

export interface MergeGroup {
  key: string;
  canonical_kra_name: string;
  canonical_kpi_name: string;
  category_id: string | null;
  proposals: MergeProposalLike[];
  variantCount: number;
  affectedKpiCount: number;
  affectedEmployeeCount: number;
  /** 'safe' only when every pair in the group is an identical-after-cleaning match. */
  triage: TriageClass;
  /** Lowest similarity found in the group (1 for exact matches). */
  minSimilarity: number;
  /** Suggested title to keep: shortest cleaned title with the widest reach. */
  suggestedCanonicalKpiName: string;
}

/** Similarity at or above which a fuzzy pair may still be batched. */
export const SAFE_SIMILARITY = 0.92;

const num = (v: number | string | null | undefined): number =>
  v == null ? 0 : typeof v === 'number' ? v : Number(v) || 0;

/** Marker where an appended description / formula / scoring tail begins. */
const TAIL_MARKER = /(\s*[-–:]\s*)?\b(description|formula|scoring\s*logic|scoring)\b\s*:?/i;

/**
 * Cleaned "core" title: the metric name with any appended description,
 * formula, scoring ladder, incentive note or month bracket removed.
 */
export function coreTitle(raw: string | null | undefined): string {
  if (!raw) return '';
  const text = String(raw);
  const cut = text.search(TAIL_MARKER);
  return normalizeConsoleTitle(cut > 0 ? text.slice(0, cut) : text);
}

/**
 * A pair is safe to batch when the two names collapse to the same cleaned
 * title, or when the scanner reported an exact / near-exact match.
 */
export function isSafePair(p: MergeProposalLike): boolean {
  const a = coreTitle(p.canonical_kpi_name);
  const b = coreTitle(p.variant_kpi_name);
  if (a && b && a === b) return true;
  if (p.match_type === 'exact') return true;
  return num(p.similarity) >= SAFE_SIMILARITY;
}


const groupKey = (p: MergeProposalLike) =>
  `${p.category_id ?? '-'}::${normalizeConsoleTitle(p.canonical_kra_name)}::${normalizeConsoleTitle(
    p.canonical_kpi_name,
  )}`;

/** Prefer the shortest clean title; break ties by widest employee reach. */
export function suggestCanonical(proposals: MergeProposalLike[]): string {
  const candidates: Array<{ name: string; reach: number }> = [];
  for (const p of proposals) {
    candidates.push({ name: p.canonical_kpi_name, reach: p.affected_employee_count });
    candidates.push({ name: p.variant_kpi_name, reach: p.affected_employee_count });
  }
  candidates.sort((x, y) => {
    const byLen = x.name.trim().length - y.name.trim().length;
    if (byLen !== 0) return byLen;
    return y.reach - x.reach;
  });
  return candidates[0]?.name ?? '';
}

export function buildMergeGroups(proposals: MergeProposalLike[]): MergeGroup[] {
  const map = new Map<string, MergeProposalLike[]>();
  for (const p of proposals) {
    const k = groupKey(p);
    const list = map.get(k);
    if (list) list.push(p);
    else map.set(k, [p]);
  }

  const groups: MergeGroup[] = [];
  for (const [key, list] of map) {
    const allSafe = list.every(isSafePair);
    groups.push({
      key,
      canonical_kra_name: list[0].canonical_kra_name,
      canonical_kpi_name: list[0].canonical_kpi_name,
      category_id: list[0].category_id ?? null,
      proposals: list,
      variantCount: list.length,
      affectedKpiCount: list.reduce((s, p) => s + (p.affected_kpi_count || 0), 0),
      affectedEmployeeCount: list.reduce((s, p) => s + (p.affected_employee_count || 0), 0),
      triage: allSafe ? 'safe' : 'judgement',
      minSimilarity: list.reduce(
        (m, p) => Math.min(m, p.match_type === 'exact' ? 1 : num(p.similarity)),
        1,
      ),
      suggestedCanonicalKpiName: suggestCanonical(list),
    });
  }

  // Safe groups first (they clear fastest), then widest impact.
  groups.sort((a, b) => {
    if (a.triage !== b.triage) return a.triage === 'safe' ? -1 : 1;
    return b.affectedEmployeeCount - a.affectedEmployeeCount;
  });
  return groups;
}

export type TriageFilter = 'all' | 'safe' | 'judgement';

export function filterGroups(groups: MergeGroup[], filter: TriageFilter): MergeGroup[] {
  if (filter === 'all') return groups;
  return groups.filter((g) => g.triage === filter);
}

/** Flattens the selected group keys into the proposal ids the RPC expects. */
export function proposalIdsForKeys(groups: MergeGroup[], keys: Iterable<string>): string[] {
  const wanted = new Set(keys);
  const ids: string[] = [];
  for (const g of groups) {
    if (!wanted.has(g.key)) continue;
    for (const p of g.proposals) ids.push(p.id);
  }
  return ids;
}

export interface TriageSummary {
  groups: number;
  safeGroups: number;
  judgementGroups: number;
  proposals: number;
  employees: number;
}

export function summarizeGroups(groups: MergeGroup[]): TriageSummary {
  return {
    groups: groups.length,
    safeGroups: groups.filter((g) => g.triage === 'safe').length,
    judgementGroups: groups.filter((g) => g.triage === 'judgement').length,
    proposals: groups.reduce((s, g) => s + g.variantCount, 0),
    employees: groups.reduce((s, g) => s + g.affectedEmployeeCount, 0),
  };
}
