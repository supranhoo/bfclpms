import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { fiscalYearForMonth } from '@/lib/fiscalWindow';

export type ArchetypeCode = 'A' | 'B' | 'C' | 'D';
export type GradeBucket = 'M' | 'W' | 'T' | 'other';

/**
 * Fiscal year bounds for an assessment cycle (July → June).
 */
export function ayBounds(cycleStartYear: number): { fromISO: string; toISO: string } {
  return {
    fromISO: `${cycleStartYear}-07-01`,
    toISO: `${cycleStartYear + 1}-06-30`,
  };
}

/**
 * Count how many distinct (review_year, review_period) buckets an employee
 * has KRA rows in across the two calendar years covered by the assessment
 * year (July Y → June Y+1). This is a conservative approximation of
 * "months with active KRAs" using the columns available on `kpis`.
 *
 * NOTE: Downstream code should treat the returned count as a lower-bound
 * signal; the assignment resolver only checks `count >= min_kra_months_in_ay`.
 */
export async function countKraMonthsInAY(
  employeeId: string,
  cycleStartYear: number,
): Promise<number> {
  const { data, error } = await supabase
    .from('kpis')
    .select('review_year, review_period')
    .eq('employee_id', employeeId)
    .in('review_year', [cycleStartYear, cycleStartYear + 1]);
  if (error) throw error;
  const buckets = new Set<string>();
  for (const row of data ?? []) {
    const rr = row as { review_year: number | null; review_period: string | null };
    const y = rr.review_year;
    const p = (rr.review_period ?? '').trim();
    if (y == null || !p) continue;
    // POLICY §90b — fiscal-window guard. Reject rows whose (period, year)
    // does not belong to the selected assessment year (Jul cycleStartYear
    // → Jun cycleStartYear+1). Without this, e.g. review_year=cycleStartYear+1
    // with review_period='July' (which belongs to the NEXT cycle) inflated
    // kraMonths and could flip employees into archetype 'A' incorrectly.
    // Ref: BUG-045.
    if (fiscalYearForMonth(p, cycleStartYear) !== y) continue;
    buckets.add(`${y}::${p}`);
  }
  return buckets.size;
}

/**
 * Derive the grade-family bucket for an employee from `pms_grades.family_bucket`.
 * Falls back to code-prefix inference when the master row is unclassified.
 */
export function bucketFromGradeCode(code: string | null | undefined): GradeBucket {
  const c = (code ?? '').toUpperCase().trim();
  if (!c) return 'other';
  if (c.startsWith('M')) return 'M';
  if (c.startsWith('W')) return 'W';
  if (c.startsWith('T')) return 'T';
  return 'other';
}

export interface ResolveArchetypeInput {
  employeeId: string;
  gradeCode: string | null;
  familyBucket: GradeBucket | null;
  cycleStartYear: number;
  minKraMonths?: number;
}

export interface ResolvedArchetype {
  code: ArchetypeCode;
  gradeBucket: GradeBucket;
  kraMonths: number;
  reason: 'kra_present' | 'no_kra_by_grade';
}

/**
 * Rule of thumb (from the P4 policy):
 *   • KRA months ≥ threshold  → A (KRA-based)
 *   • else grade bucket M     → B
 *   • else grade bucket W     → C
 *   • else T / other          → D
 */
export async function resolveArchetypeForEmployee(
  input: ResolveArchetypeInput,
): Promise<ResolvedArchetype> {
  const minKraMonths = input.minKraMonths ?? 1;
  const bucket: GradeBucket = input.familyBucket ?? bucketFromGradeCode(input.gradeCode);
  const kraMonths = await countKraMonthsInAY(input.employeeId, input.cycleStartYear);
  if (kraMonths >= minKraMonths) {
    return { code: 'A', gradeBucket: bucket, kraMonths, reason: 'kra_present' };
  }
  const code: ArchetypeCode = bucket === 'M' ? 'B' : bucket === 'W' ? 'C' : 'D';
  return { code, gradeBucket: bucket, kraMonths, reason: 'no_kra_by_grade' };
}

// ── Assignment Rule types (P4) ────────────────────────────────────

export type AssignmentRuleRow =
  Database['public']['Tables']['annual_review_assignment_rules']['Row'];

export interface ArchetypeRuleFields {
  archetype_code: ArchetypeCode | null;
  grade_bucket: GradeBucket | null;
  requires_kra_in_ay: boolean;
  min_kra_months_in_ay: number;
}

export function readArchetypeFields(row: AssignmentRuleRow): ArchetypeRuleFields {
  const rr = row as unknown as Record<string, unknown>;
  return {
    archetype_code: (rr.archetype_code as ArchetypeCode | null) ?? null,
    grade_bucket: (rr.grade_bucket as GradeBucket | null) ?? null,
    requires_kra_in_ay: Boolean(rr.requires_kra_in_ay ?? false),
    min_kra_months_in_ay: Number(rr.min_kra_months_in_ay ?? 1),
  };
}