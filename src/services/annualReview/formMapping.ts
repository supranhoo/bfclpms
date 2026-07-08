import { supabase } from '@/integrations/supabase/client';
import type { AssignmentFilters, AnnualReviewAssignmentRule } from '@/types/annualReview';
import { bucketFromGradeCode } from './archetypeResolver';
import { fetchAllPaged } from '@/lib/fetchAll';

/**
 * Aggregate template usage for one cycle — one row per template that has at
 * least one seeded instance. Effective template is
 * `COALESCE(template_override_id, template_id)`, mirroring the resolver rule
 * used by the render layer.
 *
 * Consumed by:
 *   • Form Mapping "Templates in use" panel
 *   • Phased Rollout template multi-select
 */
export interface TemplateInUse {
  template_id: string;
  name: string;
  employees_count: number;
}

export async function listTemplatesInUse(cycleId: string): Promise<TemplateInUse[]> {
  if (!cycleId) return [];
  const rows = await fetchAllPaged<{
    employee_id: string;
    template_id: string | null;
    template_override_id: string | null;
  }>((from, to) =>
    supabase
      .from('annual_review_instances')
      .select('employee_id, template_id, template_override_id')
      .eq('cycle_id', cycleId)
      .range(from, to),
  );

  const counts = new Map<string, number>();
  for (const r of rows) {
    const eff = r.template_override_id ?? r.template_id;
    if (!eff) continue;
    counts.set(eff, (counts.get(eff) ?? 0) + 1);
  }
  if (counts.size === 0) return [];

  const { data: tpls, error } = await supabase
    .from('annual_review_templates')
    .select('id, name')
    .in('id', Array.from(counts.keys()));
  if (error) throw error;

  return (tpls ?? [])
    .map((t) => ({
      template_id: t.id as string,
      name: (t.name as string) ?? '(unnamed)',
      employees_count: counts.get(t.id as string) ?? 0,
    }))
    .sort((a, b) => b.employees_count - a.employees_count);
}

/**
 * Form Mapping SSOT — one place that decides which template an employee
 * will see for a cycle. Reused by:
 *   • the mapping-preview UI (dry-run counts, unmapped list)
 *   • the coverage gate before "Start cycle"
 *   • (indirectly) `seedInstancesByRules`, which shares the same matcher
 *
 * Precedence at render time (already implemented by `resolveTemplateId`):
 *   instance.template_override_id  >  instance.template_id  >  null
 *
 * This service resolves the *pre-seed* prediction: what template WILL an
 * employee be assigned by the active-rules matcher, without actually
 * seeding. That answer is compared with the seeded instance (if any) to
 * report coverage.
 */

export interface MappingProfile {
  id: string;
  full_name: string | null;
  employee_code: string | null;
  designation: string | null;
  pms_grade: string | null;
  level: string | null;
  department_id: string | null;
}

/**
 * Pure matcher — mirrors the inline `matches()` inside
 * `seedInstancesByRules`. Keep both in sync; the unit test in
 * `formMapping.test.ts` locks the behaviour.
 */
export function matchesFilters(
  filters: Partial<AssignmentFilters> | null | undefined,
  profile: MappingProfile,
  deptToBu: Record<string, string | null>,
  krasEmpIds?: Set<string> | null,
): boolean {
  const f = filters ?? {};
  const list = (k: keyof AssignmentFilters): string[] =>
    Array.isArray((f as Record<string, unknown>)[k])
      ? ((f as Record<string, unknown>)[k] as string[])
      : [];
  if (list('roles').length && !list('roles').includes(profile.designation ?? '')) return false;
  if (list('grades').length && !list('grades').includes(profile.pms_grade ?? '')) return false;
  const gradeBucket = (f as Record<string, unknown>).grade_bucket;
  if (typeof gradeBucket === 'string' && gradeBucket && bucketFromGradeCode(profile.pms_grade) !== gradeBucket) return false;
  if (list('levels').length && !list('levels').includes(profile.level ?? '')) return false;
  if (list('department_ids').length && !list('department_ids').includes(profile.department_id ?? '')) return false;
  if (list('bu_ids').length) {
    const bu = profile.department_id ? deptToBu[profile.department_id] ?? null : null;
    if (!bu || !list('bu_ids').includes(bu)) return false;
  }
  // Optional "Has KRAs in last N months" restriction. Caller MUST pass the
  // matching set when `has_kras` is 'yes'|'no'; if omitted the filter is
  // treated as satisfied (preview-only helpers use this to short-circuit).
  const hasKras = (f as Record<string, unknown>).has_kras;
  if ((hasKras === 'yes' || hasKras === 'no') && krasEmpIds) {
    const present = krasEmpIds.has(profile.id);
    if (hasKras === 'yes' && !present) return false;
    if (hasKras === 'no' && present) return false;
  }
  return true;
}

/**
 * Pre-seed resolver — walk active rules in priority order (lowest wins)
 * and return the first template_id whose filters match. `null` = no rule
 * matched (employee would be skipped by the seeder).
 */
export function resolveTemplateForProfile(
  rules: Pick<AnnualReviewAssignmentRule, 'id' | 'template_id' | 'filters' | 'is_active' | 'priority'>[],
  profile: MappingProfile,
  deptToBu: Record<string, string | null>,
  krasSets?: Map<number, Set<string>> | null,
): { templateId: string | null; matchedRuleIdx: number | null } {
  // Deterministic tie-break: when two rules share the same priority number,
  // fall back to the rule id so results are stable across DB row order and
  // predictable in tests. Fixes the "new rule shadowed by older rule with the
  // same priority" bug observed in Form Mapping.
  const active = rules
    .filter((r) => r.is_active)
    .slice()
    .sort(
      (a, b) =>
        a.priority - b.priority ||
        String(a.id ?? '').localeCompare(String(b.id ?? '')),
    );
  for (let i = 0; i < active.length; i++) {
    const w = windowMonthsFromFilters(active[i].filters);
    const set = krasSets?.get(w) ?? null;
    if (matchesFilters(active[i].filters, profile, deptToBu, set)) {
      return { templateId: active[i].template_id, matchedRuleIdx: i };
    }
  }
  return { templateId: null, matchedRuleIdx: null };
}

/** Default window in months for the `has_kras` filter. */
export const DEFAULT_KRAS_WINDOW_MONTHS = 12;

/** Extract the (validated) window size a rule/filter uses. */
export function windowMonthsFromFilters(
  filters: Partial<AssignmentFilters> | null | undefined,
): number {
  const raw = Number((filters as { kras_window_months?: unknown } | null | undefined)?.kras_window_months);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_KRAS_WINDOW_MONTHS;
  return Math.min(Math.max(Math.round(raw), 1), 36);
}

// ── DB helpers ────────────────────────────────────────────────────

async function fetchActiveProfiles(): Promise<MappingProfile[]> {
  const PAGE = 1000;
  const out: MappingProfile[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, employee_code, designation, pms_grade, level, department_id')
      .eq('is_active', true)
      .eq('is_dummy_employee', false)
      .order('full_name')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []) as MappingProfile[];
    out.push(...batch);
    if (batch.length < PAGE) break;
  }
  return out;
}

async function fetchDeptToBu(): Promise<Record<string, string | null>> {
  const { data, error } = await supabase.from('departments').select('id, business_unit_id');
  if (error) throw error;
  const map: Record<string, string | null> = {};
  for (const d of data ?? []) map[d.id] = (d as { business_unit_id: string | null }).business_unit_id;
  return map;
}

/**
 * Distinct employee_ids appearing in `public.kpis` inside the last `months`
 * window. Paged (1000/page) to respect POLICY §94; memoised per window size
 * so the preview and coverage report share a single fetch per render.
 */
const krasCache = new Map<number, Promise<Set<string>>>();
/**
 * Clears the in-memory KRAs cache. Called from `checkMappingCoverage` so that
 * pressing "Refresh coverage" always recomputes against fresh KRA membership
 * (previously the memoised Promise made toggling `has_kras` a no-op until
 * page reload). Also used by tests.
 */
export function _resetKrasCache() { krasCache.clear(); }
/** @deprecated Use `_resetKrasCache`. Kept as an alias for older tests. */
export const _resetKrasCacheForTests = _resetKrasCache;
export function fetchEmployeesWithKrasSince(months: number): Promise<Set<string>> {
  const w = Math.min(Math.max(Math.round(months), 1), 36);
  const cached = krasCache.get(w);
  if (cached) return cached;
  const p = (async () => {
    const since = new Date();
    since.setMonth(since.getMonth() - w);
    const sinceIso = since.toISOString();
    const out = new Set<string>();
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('kpis')
        .select('employee_id')
        .not('employee_id', 'is', null)
        .gte('created_at', sinceIso)
        .order('employee_id')
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const batch = (data ?? []) as Array<{ employee_id: string | null }>;
      for (const r of batch) if (r.employee_id) out.add(r.employee_id);
      if (batch.length < PAGE) break;
    }
    return out;
  })();
  krasCache.set(w, p);
  return p;
}

/**
 * Dry-run: how many active employees match this filter set right now.
 * Returns the actual list (capped `limit`) so the UI can list examples.
 */
export async function previewAudience(
  filters: Partial<AssignmentFilters>,
  opts: { limit?: number } = {},
): Promise<{ total: number; sample: MappingProfile[] }> {
  const needsKras = filters?.has_kras === 'yes' || filters?.has_kras === 'no';
  const w = windowMonthsFromFilters(filters);
  const [profiles, deptToBu, krasSet] = await Promise.all([
    fetchActiveProfiles(),
    fetchDeptToBu(),
    needsKras ? fetchEmployeesWithKrasSince(w) : Promise.resolve<Set<string> | null>(null),
  ]);
  const matched = profiles.filter((p) => matchesFilters(filters, p, deptToBu, krasSet));
  return { total: matched.length, sample: matched.slice(0, opts.limit ?? 100) };
}

// ── Coverage ──────────────────────────────────────────────────────

export interface CoverageRow {
  employee: MappingProfile;
  resolvedTemplateId: string | null;
  seededTemplateId: string | null;
  hasOverride: boolean;
  matchedRuleIdx: number | null;
  status: 'seeded' | 'will_seed' | 'unmapped';
}

export interface CoverageReport {
  cycleId: string;
  totalEmployees: number;
  mapped: number;
  unmapped: number;
  seeded: number;
  willSeed: number;
  rows: CoverageRow[];
}

/**
 * Full coverage report for a cycle. For every active employee, reports:
 *   • seeded template (from `annual_review_instances`, honouring override)
 *   • pre-seed prediction (from active rules)
 *   • whether the employee is unmapped
 *
 * Callers should block "Start cycle" if `unmapped > 0`.
 */
export async function checkMappingCoverage(cycleId: string): Promise<CoverageReport> {
  // Bust the KRAs memo so Refresh always recomputes (bug: toggling has_kras
  // filter + Refresh coverage kept showing stale membership).
  _resetKrasCache();
  const [profiles, deptToBu, rulesRes, instRows] = await Promise.all([
    fetchActiveProfiles(),
    fetchDeptToBu(),
    supabase
      .from('annual_review_assignment_rules')
      .select('id, template_id, cycle_id, filters, is_active, priority')
      .eq('cycle_id', cycleId),
    // POLICY §94 — paged read to bypass PostgREST's 1000-row cap.
    // Previously an unpaged .select() capped Seeded at 1000 and
    // misclassified every extra employee as "will_seed".
    fetchAllPaged<{
      id: string;
      employee_id: string;
      template_id: string | null;
      template_override_id: string | null;
    }>((from, to) =>
      supabase
        .from('annual_review_instances')
        .select('id, employee_id, template_id, template_override_id')
        .eq('cycle_id', cycleId)
        .order('id')
        .range(from, to) as unknown as PromiseLike<{ data: any; error: unknown }>,
    ),
  ]);
  if (rulesRes.error) throw rulesRes.error;

  const rules = (rulesRes.data ?? []) as unknown as AnnualReviewAssignmentRule[];

  // Fetch one KRA set per distinct window size used by any active rule
  // that opts into the has_kras filter. Rules that don't use it pass `null`.
  const windows = new Set<number>();
  for (const r of rules) {
    if (!r.is_active) continue;
    const f = r.filters as Partial<AssignmentFilters> | null | undefined;
    if (f?.has_kras === 'yes' || f?.has_kras === 'no') {
      windows.add(windowMonthsFromFilters(f));
    }
  }
  const krasSets = new Map<number, Set<string>>();
  await Promise.all(
    [...windows].map(async (w) => { krasSets.set(w, await fetchEmployeesWithKrasSince(w)); }),
  );

  const byEmp = new Map<string, { template_id: string | null; override: string | null }>();
  for (const r of instRows) {
    byEmp.set(r.employee_id, { template_id: r.template_id, override: r.template_override_id });
  }

  const rows: CoverageRow[] = profiles.map((p) => {
    const inst = byEmp.get(p.id);
    const seeded = inst ? inst.override ?? inst.template_id : null;
    const pred = resolveTemplateForProfile(rules, p, deptToBu, krasSets);
    const resolved = seeded ?? pred.templateId;
    const status: CoverageRow['status'] = seeded
      ? 'seeded'
      : pred.templateId
        ? 'will_seed'
        : 'unmapped';
    return {
      employee: p,
      resolvedTemplateId: resolved,
      seededTemplateId: seeded,
      hasOverride: !!inst?.override,
      matchedRuleIdx: pred.matchedRuleIdx,
      status,
    };
  });

  const unmapped = rows.filter((r) => r.status === 'unmapped').length;
  const seeded = rows.filter((r) => r.status === 'seeded').length;
  const willSeed = rows.filter((r) => r.status === 'will_seed').length;
  return {
    cycleId,
    totalEmployees: rows.length,
    mapped: seeded + willSeed,
    unmapped,
    seeded,
    willSeed,
    rows,
  };
}

/**
 * Paged fetch of every department's id → name mapping. Used by the
 * form-mapping "Templates in use" dialog to render department names
 * alongside employee rows without joining per-row.
 */
export async function fetchDepartmentNameMap(): Promise<Map<string, string>> {
  const rows = await fetchAllPaged<{ id: string; name: string | null }>((from, to) =>
    supabase.from('departments').select('id, name').order('name').range(from, to),
  );
  const m = new Map<string, string>();
  for (const r of rows ?? []) m.set(r.id, r.name ?? '');
  return m;
}