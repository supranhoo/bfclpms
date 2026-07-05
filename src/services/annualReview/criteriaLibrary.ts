import { supabase } from '@/integrations/supabase/client';
import type { Database, Json } from '@/integrations/supabase/types';

export type CriterionRow = Database['public']['Tables']['annual_review_criteria_library']['Row'];
export type CriterionInsert = Database['public']['Tables']['annual_review_criteria_library']['Insert'];
export type CriterionAssignmentRow = Database['public']['Tables']['annual_review_criteria_assignments']['Row'];
export type CriterionAssignmentInsert = Database['public']['Tables']['annual_review_criteria_assignments']['Insert'];

/** Resolved criterion for a (archetype × grade × dept × sub-unit) target. */
export interface ResolvedCriterion {
  id: string;
  key: string;
  label_en: string;
  label_hi: string | null;
  max_score: number;
  scoring_bands: Json;
  weight_pct: number;
  sort_order: number;
}

// ── Library CRUD ─────────────────────────────────────────────────

export async function listCriteriaLibrary(): Promise<CriterionRow[]> {
  const { data, error } = await supabase
    .from('annual_review_criteria_library')
    .select('*')
    .order('sort_order')
    .order('label_en');
  if (error) throw error;
  return data ?? [];
}

export async function upsertCriterion(input: CriterionInsert): Promise<CriterionRow> {
  const { data, error } = await supabase
    .from('annual_review_criteria_library')
    .upsert(input, { onConflict: 'key' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCriterion(id: string): Promise<void> {
  const { error } = await supabase.from('annual_review_criteria_library').delete().eq('id', id);
  if (error) throw error;
}

// ── Assignment matrix ─────────────────────────────────────────────

export async function listCriteriaAssignments(): Promise<CriterionAssignmentRow[]> {
  const PAGE = 1000;
  const out: CriterionAssignmentRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('annual_review_criteria_assignments')
      .select('*')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export interface AssignmentUpsertInput {
  criterion_id: string;
  archetype_code: string | null;
  grade_bucket: string | null;
  department_id: string | null;
  sub_unit_id: string | null;
  weight_pct: number;
  is_enabled: boolean;
}

/**
 * Upsert a single assignment cell. Manual resolve is required because the
 * unique index uses COALESCE on nullable keys (same pattern as weight matrix).
 * `weight_pct === 0` + `is_enabled === true` is treated as a delete so wildcard
 * fallbacks resume.
 */
export async function saveCriteriaAssignment(input: AssignmentUpsertInput): Promise<void> {
  let q = supabase
    .from('annual_review_criteria_assignments')
    .select('id')
    .eq('criterion_id', input.criterion_id);
  q = input.archetype_code ? q.eq('archetype_code', input.archetype_code) : q.is('archetype_code', null);
  q = input.grade_bucket ? q.eq('grade_bucket', input.grade_bucket) : q.is('grade_bucket', null);
  q = input.department_id ? q.eq('department_id', input.department_id) : q.is('department_id', null);
  q = input.sub_unit_id ? q.eq('sub_unit_id', input.sub_unit_id) : q.is('sub_unit_id', null);
  const { data: existing, error: selErr } = await q.maybeSingle();
  if (selErr) throw selErr;

  const isDelete = input.weight_pct === 0 && input.is_enabled;
  if (isDelete && existing) {
    const { error } = await supabase
      .from('annual_review_criteria_assignments')
      .delete()
      .eq('id', existing.id);
    if (error) throw error;
    return;
  }
  if (isDelete) return;

  if (existing) {
    const { error } = await supabase
      .from('annual_review_criteria_assignments')
      .update({ weight_pct: input.weight_pct, is_enabled: input.is_enabled })
      .eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('annual_review_criteria_assignments').insert({
      criterion_id: input.criterion_id,
      archetype_code: input.archetype_code,
      grade_bucket: input.grade_bucket,
      department_id: input.department_id,
      sub_unit_id: input.sub_unit_id,
      weight_pct: input.weight_pct,
      is_enabled: input.is_enabled,
    });
    if (error) throw error;
  }
}

export async function deleteCriteriaAssignment(id: string): Promise<void> {
  const { error } = await supabase.from('annual_review_criteria_assignments').delete().eq('id', id);
  if (error) throw error;
}

// ── Resolver ──────────────────────────────────────────────────────

/**
 * Score an assignment row's specificity for a target context.
 * Sub-unit=8, Dept=4, Grade=2, Archetype=1. NULL = wildcard.
 * Returns -1 if the row does not match the target at all.
 */
function scoreAssignment(
  a: CriterionAssignmentRow,
  target: { archetype: string | null; grade: string | null; dept: string | null; subUnit: string | null },
): number {
  if (a.archetype_code && a.archetype_code !== target.archetype) return -1;
  if (a.grade_bucket && a.grade_bucket !== target.grade) return -1;
  if (a.department_id && a.department_id !== target.dept) return -1;
  if (a.sub_unit_id && a.sub_unit_id !== target.subUnit) return -1;
  return (a.sub_unit_id ? 8 : 0) + (a.department_id ? 4 : 0) + (a.grade_bucket ? 2 : 0) + (a.archetype_code ? 1 : 0);
}

/**
 * Resolve the ordered criteria list for a template cell.
 *
 * Rules:
 *   1. For each criterion in the library (is_active), find the most specific
 *      matching assignment row. If none, the criterion is not included.
 *   2. If the winning row has `is_enabled = false`, the criterion is suppressed
 *      (used to drop a common question for one dept, e.g. "M no Env").
 *   3. `weight_pct` comes from the winning row.
 *   4. Output is sorted by library `sort_order` then `label_en`.
 */
export function resolveCriteria(
  library: CriterionRow[],
  assignments: CriterionAssignmentRow[],
  target: { archetype: string | null; grade: string | null; dept: string | null; subUnit: string | null },
): ResolvedCriterion[] {
  const byCrit = new Map<string, CriterionAssignmentRow[]>();
  for (const a of assignments) {
    const arr = byCrit.get(a.criterion_id) ?? [];
    arr.push(a);
    byCrit.set(a.criterion_id, arr);
  }

  const out: ResolvedCriterion[] = [];
  for (const c of library) {
    if (!c.is_active) continue;
    const rows = byCrit.get(c.id) ?? [];
    let best: CriterionAssignmentRow | null = null;
    let bestScore = -1;
    for (const a of rows) {
      const s = scoreAssignment(a, target);
      if (s > bestScore) { best = a; bestScore = s; }
    }
    if (!best) continue;              // no assignment covers this cell
    if (!best.is_enabled) continue;   // explicit suppression
    out.push({
      id: c.id,
      key: c.key,
      label_en: c.label_en,
      label_hi: c.label_hi,
      max_score: Number(c.max_score),
      scoring_bands: c.scoring_bands,
      weight_pct: Number(best.weight_pct),
      sort_order: c.sort_order,
    });
  }
  out.sort((a, b) => (a.sort_order - b.sort_order) || a.label_en.localeCompare(b.label_en));
  return out;
}
