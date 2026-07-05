import { supabase } from '@/integrations/supabase/client';
import type { Database, Json } from '@/integrations/supabase/types';

export type SystemKpiRow = Database['public']['Tables']['annual_review_system_kpis']['Row'];
export type SystemKpiInsert = Database['public']['Tables']['annual_review_system_kpis']['Insert'];
export type SystemKpiWeightRow = Database['public']['Tables']['annual_review_system_kpi_weights']['Row'];
export type SystemKpiWeightInsert = Database['public']['Tables']['annual_review_system_kpi_weights']['Insert'];

/** One band inside `scoring_rules.bands`. */
export interface ScoringBand { score: number; threshold: number }
export interface ScoringRules {
  direction: 'higher_better' | 'lower_better';
  bands: ScoringBand[];
}

export const UOM_TYPES = ['count', 'percent', 'days', 'rating'] as const;
export type UomType = typeof UOM_TYPES[number];

export function parseScoringRules(raw: Json | null | undefined): ScoringRules {
  const fallback: ScoringRules = { direction: 'higher_better', bands: [] };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fallback;
  const obj = raw as Record<string, unknown>;
  const direction = obj.direction === 'lower_better' ? 'lower_better' : 'higher_better';
  const bands = Array.isArray(obj.bands)
    ? obj.bands
        .map((b) => {
          if (!b || typeof b !== 'object') return null;
          const bb = b as Record<string, unknown>;
          const score = Number(bb.score);
          const threshold = Number(bb.threshold);
          if (!Number.isFinite(score) || !Number.isFinite(threshold)) return null;
          return { score, threshold };
        })
        .filter((b): b is ScoringBand => b !== null)
        .sort((a, b) => b.score - a.score)
    : [];
  return { direction, bands };
}

// ── KPI Library ────────────────────────────────────────────────────

export async function listSystemKpis(): Promise<SystemKpiRow[]> {
  const { data, error } = await supabase
    .from('annual_review_system_kpis')
    .select('*')
    .order('sort_order')
    .order('name_en');
  if (error) throw error;
  return data ?? [];
}

export async function upsertSystemKpi(input: SystemKpiInsert): Promise<SystemKpiRow> {
  const { data, error } = await supabase
    .from('annual_review_system_kpis')
    .upsert(input, { onConflict: 'key' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function deleteSystemKpi(id: string): Promise<void> {
  const { error } = await supabase.from('annual_review_system_kpis').delete().eq('id', id);
  if (error) throw error;
}

// ── Weight Matrix ─────────────────────────────────────────────────

export async function listSystemKpiWeights(): Promise<SystemKpiWeightRow[]> {
  const PAGE = 1000;
  const out: SystemKpiWeightRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('annual_review_system_kpi_weights')
      .select('*')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export interface WeightUpsertInput {
  system_kpi_id: string;
  department_id: string | null;
  sub_unit_id: string | null;
  grade_bucket: string | null;
  weight_pct: number;
}

/**
 * Upsert a single weight-matrix cell. Since the unique index uses COALESCE
 * on nullable keys, we manually resolve the existing row before writing.
 */
export async function saveSystemKpiWeight(input: WeightUpsertInput): Promise<void> {
  let q = supabase
    .from('annual_review_system_kpi_weights')
    .select('id')
    .eq('system_kpi_id', input.system_kpi_id);
  q = input.department_id ? q.eq('department_id', input.department_id) : q.is('department_id', null);
  q = input.sub_unit_id ? q.eq('sub_unit_id', input.sub_unit_id) : q.is('sub_unit_id', null);
  q = input.grade_bucket ? q.eq('grade_bucket', input.grade_bucket) : q.is('grade_bucket', null);
  const { data: existing, error: selErr } = await q.maybeSingle();
  if (selErr) throw selErr;

  if (input.weight_pct === 0 && existing) {
    // Treat 0 as "delete the cell" so wildcard fallbacks can apply.
    const { error } = await supabase
      .from('annual_review_system_kpi_weights')
      .delete()
      .eq('id', existing.id);
    if (error) throw error;
    return;
  }
  if (input.weight_pct === 0) return;

  if (existing) {
    const { error } = await supabase
      .from('annual_review_system_kpi_weights')
      .update({ weight_pct: input.weight_pct })
      .eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('annual_review_system_kpi_weights')
      .insert({
        system_kpi_id: input.system_kpi_id,
        department_id: input.department_id,
        sub_unit_id: input.sub_unit_id,
        grade_bucket: input.grade_bucket,
        weight_pct: input.weight_pct,
      });
    if (error) throw error;
  }
}

export async function deleteSystemKpiWeight(id: string): Promise<void> {
  const { error } = await supabase
    .from('annual_review_system_kpi_weights')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ── Resolver ──────────────────────────────────────────────────────

/**
 * Pick the most-specific weight row for a (dept, sub-unit, grade, kpi) target.
 * NULL in a row means "wildcard". Specificity score:
 *   sub_unit match = 4, department match = 2, grade match = 1.
 */
export function resolveWeight(
  rows: SystemKpiWeightRow[],
  kpiId: string,
  departmentId: string | null,
  subUnitId: string | null,
  gradeBucket: string | null,
): SystemKpiWeightRow | null {
  let best: SystemKpiWeightRow | null = null;
  let bestScore = -1;
  for (const r of rows) {
    if (r.system_kpi_id !== kpiId) continue;
    if (r.department_id && r.department_id !== departmentId) continue;
    if (r.sub_unit_id && r.sub_unit_id !== subUnitId) continue;
    if (r.grade_bucket && r.grade_bucket !== gradeBucket) continue;
    const s =
      (r.sub_unit_id ? 4 : 0) +
      (r.department_id ? 2 : 0) +
      (r.grade_bucket ? 1 : 0);
    if (s > bestScore) { best = r; bestScore = s; }
  }
  return best;
}