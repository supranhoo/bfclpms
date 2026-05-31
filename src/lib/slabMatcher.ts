/**
 * Increment slab matcher.
 *
 * Slabs may be scoped by 6 org dimensions (company / division / business_unit /
 * location / category / level). An empty `*_ids` array means "applies to every
 * value of that dimension". Among applicable slabs whose rating window contains
 * the score, the slab with the **highest specificity** wins. Ties are broken by
 * lower `sort_order`, then by the most-recently-updated row.
 *
 * This file is pure (no React / no Supabase) so it can run unchanged inside
 * Deno edge functions and inside Vitest.
 */

export interface SlabLike {
  id?: string;
  rating_from: number | string;
  rating_to: number | string;
  increment_percent: number | string;
  prorate_on_doj?: boolean;
  sort_order?: number | null;
  updated_at?: string | null;
  company_ids?: string[] | null;
  division_ids?: string[] | null;
  business_unit_ids?: string[] | null;
  location_ids?: string[] | null;
  category_ids?: string[] | null;
  level_ids?: string[] | null;
}

export interface EmployeeDims {
  company_id?: string | null;
  division_id?: string | null;
  business_unit_id?: string | null;
  location_id?: string | null;
  category_id?: string | null;
  level_id?: string | null;
}

const DIMENSIONS: Array<{ slab: keyof SlabLike; emp: keyof EmployeeDims }> = [
  { slab: 'company_ids',       emp: 'company_id' },
  { slab: 'division_ids',      emp: 'division_id' },
  { slab: 'business_unit_ids', emp: 'business_unit_id' },
  { slab: 'location_ids',      emp: 'location_id' },
  { slab: 'category_ids',      emp: 'category_id' },
  { slab: 'level_ids',         emp: 'level_id' },
];

function arr(x: unknown): string[] {
  return Array.isArray(x) ? (x as string[]) : [];
}

/** True if every scoped dimension on the slab includes the employee's value. */
export function isSlabApplicable(slab: SlabLike, emp: EmployeeDims): boolean {
  for (const d of DIMENSIONS) {
    const scope = arr(slab[d.slab] as unknown);
    if (scope.length === 0) continue; // "any"
    const v = emp[d.emp];
    if (!v || !scope.includes(v)) return false;
  }
  return true;
}

/** Number of dimensions that are explicitly scoped (used as specificity). */
export function slabSpecificity(slab: SlabLike): number {
  let n = 0;
  for (const d of DIMENSIONS) if (arr(slab[d.slab] as unknown).length > 0) n++;
  return n;
}

/** Pick the most-specific applicable slab whose band contains the score. */
export function pickSlab<T extends SlabLike>(
  slabs: T[],
  emp: EmployeeDims,
  score: number,
): T | null {
  const candidates = slabs.filter(
    (s) =>
      score >= Number(s.rating_from) &&
      score <= Number(s.rating_to) &&
      isSlabApplicable(s, emp),
  );
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const sa = slabSpecificity(a);
    const sb = slabSpecificity(b);
    if (sa !== sb) return sb - sa;                       // more specific first
    const oa = a.sort_order ?? 0;
    const ob = b.sort_order ?? 0;
    if (oa !== ob) return oa - ob;                       // lower sort_order wins
    const ua = a.updated_at ? Date.parse(a.updated_at) : 0;
    const ub = b.updated_at ? Date.parse(b.updated_at) : 0;
    return ub - ua;                                       // newest wins
  });
  return candidates[0];
}

/** Human-readable label for a slab's scope, used in UI chips and run remarks. */
export function describeScope(
  slab: SlabLike,
  resolveName?: (dim: keyof EmployeeDims, id: string) => string | undefined,
): string {
  const parts: string[] = [];
  const labelMap: Record<keyof EmployeeDims, string> = {
    company_id: 'Company',
    division_id: 'Division',
    business_unit_id: 'BU',
    location_id: 'Location',
    category_id: 'Category',
    level_id: 'Level',
  };
  for (const d of DIMENSIONS) {
    const ids = arr(slab[d.slab] as unknown);
    if (ids.length === 0) continue;
    const names = resolveName
      ? ids.map((id) => resolveName(d.emp, id) ?? id.slice(0, 6))
      : ids.map((id) => id.slice(0, 6));
    parts.push(`${labelMap[d.emp]}: ${names.join(', ')}`);
  }
  return parts.length === 0 ? 'All employees' : parts.join(' · ');
}

/** Detect exact-scope duplicates within the same rating band (UI guardrail). */
export function isExactScopeDuplicate(a: SlabLike, b: SlabLike): boolean {
  if (Number(a.rating_from) !== Number(b.rating_from)) return false;
  if (Number(a.rating_to) !== Number(b.rating_to)) return false;
  for (const d of DIMENSIONS) {
    const sa = [...arr(a[d.slab] as unknown)].sort();
    const sb = [...arr(b[d.slab] as unknown)].sort();
    if (sa.length !== sb.length) return false;
    for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return false;
  }
  return true;
}