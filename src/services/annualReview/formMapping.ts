import { supabase } from '@/integrations/supabase/client';
import type { AssignmentFilters, AnnualReviewAssignmentRule } from '@/types/annualReview';

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
): boolean {
  const f = filters ?? {};
  const list = (k: keyof AssignmentFilters): string[] =>
    Array.isArray((f as Record<string, unknown>)[k])
      ? ((f as Record<string, unknown>)[k] as string[])
      : [];
  if (list('roles').length && !list('roles').includes(profile.designation ?? '')) return false;
  if (list('grades').length && !list('grades').includes(profile.pms_grade ?? '')) return false;
  if (list('levels').length && !list('levels').includes(profile.level ?? '')) return false;
  if (list('department_ids').length && !list('department_ids').includes(profile.department_id ?? '')) return false;
  if (list('bu_ids').length) {
    const bu = profile.department_id ? deptToBu[profile.department_id] ?? null : null;
    if (!bu || !list('bu_ids').includes(bu)) return false;
  }
  return true;
}

/**
 * Pre-seed resolver — walk active rules in priority order (lowest wins)
 * and return the first template_id whose filters match. `null` = no rule
 * matched (employee would be skipped by the seeder).
 */
export function resolveTemplateForProfile(
  rules: Pick<AnnualReviewAssignmentRule, 'template_id' | 'filters' | 'is_active' | 'priority'>[],
  profile: MappingProfile,
  deptToBu: Record<string, string | null>,
): { templateId: string | null; matchedRuleIdx: number | null } {
  const active = rules.filter((r) => r.is_active).slice().sort((a, b) => a.priority - b.priority);
  for (let i = 0; i < active.length; i++) {
    if (matchesFilters(active[i].filters, profile, deptToBu)) {
      return { templateId: active[i].template_id, matchedRuleIdx: i };
    }
  }
  return { templateId: null, matchedRuleIdx: null };
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
 * Dry-run: how many active employees match this filter set right now.
 * Returns the actual list (capped `limit`) so the UI can list examples.
 */
export async function previewAudience(
  filters: Partial<AssignmentFilters>,
  opts: { limit?: number } = {},
): Promise<{ total: number; sample: MappingProfile[] }> {
  const [profiles, deptToBu] = await Promise.all([fetchActiveProfiles(), fetchDeptToBu()]);
  const matched = profiles.filter((p) => matchesFilters(filters, p, deptToBu));
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
  const [profiles, deptToBu, rulesRes, instRes] = await Promise.all([
    fetchActiveProfiles(),
    fetchDeptToBu(),
    supabase
      .from('annual_review_assignment_rules')
      .select('id, template_id, cycle_id, filters, is_active, priority')
      .eq('cycle_id', cycleId),
    supabase
      .from('annual_review_instances')
      .select('id, employee_id, template_id, template_override_id')
      .eq('cycle_id', cycleId),
  ]);
  if (rulesRes.error) throw rulesRes.error;
  if (instRes.error) throw instRes.error;

  const rules = (rulesRes.data ?? []) as unknown as AnnualReviewAssignmentRule[];
  const byEmp = new Map<string, { template_id: string | null; override: string | null }>();
  for (const i of instRes.data ?? []) {
    const r = i as { employee_id: string; template_id: string | null; template_override_id: string | null };
    byEmp.set(r.employee_id, { template_id: r.template_id, override: r.template_override_id });
  }

  const rows: CoverageRow[] = profiles.map((p) => {
    const inst = byEmp.get(p.id);
    const seeded = inst ? inst.override ?? inst.template_id : null;
    const pred = resolveTemplateForProfile(rules, p, deptToBu);
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