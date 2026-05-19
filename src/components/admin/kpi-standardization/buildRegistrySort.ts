/**
 * Match strength for a scanner group, used to sort the Build Registry list
 * from "most similar" (top) down to "least similar". Exact-match groups score
 * 1; fuzzy groups use the highest variant similarity in the cluster.
 */
interface SortableVariant {
  match_type?: 'exact' | 'fuzzy';
  similarity?: number;
  row_count?: number;
}

interface SortableGroup {
  variants: SortableVariant[];
  normalized_kpi?: string;
  row_count?: number;
}

export function groupMatchScore(group: { variants: SortableVariant[] }): number {
  const variants = group.variants ?? [];
  if (variants.some(v => v.match_type === 'exact')) return 1;
  let max = 0;
  for (const v of variants) {
    if (typeof v.similarity === 'number' && v.similarity > max) max = v.similarity;
  }
  return max;
}

const totalRowCount = (g: SortableGroup): number =>
  typeof g.row_count === 'number'
    ? g.row_count
    : (g.variants ?? []).reduce((s, v) => s + (v.row_count ?? 0), 0);

export function compareGroupsByMatch(a: SortableGroup, b: SortableGroup): number {
  const scoreDiff = groupMatchScore(b) - groupMatchScore(a);
  if (scoreDiff !== 0) return scoreDiff;
  const rowDiff = totalRowCount(b) - totalRowCount(a);
  if (rowDiff !== 0) return rowDiff;
  const variantDiff = (b.variants?.length ?? 0) - (a.variants?.length ?? 0);
  if (variantDiff !== 0) return variantDiff;
  return (a.normalized_kpi ?? '').localeCompare(b.normalized_kpi ?? '');
}

export function sortGroupsByMatch<G extends SortableGroup>(groups: G[]): G[] {
  return [...groups].sort(compareGroupsByMatch);
}