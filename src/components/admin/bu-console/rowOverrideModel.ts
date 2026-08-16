/**
 * ADR-282 — per-employee tuning is scope-only.
 *
 * The scoring model of a KPI (its type, its qualitative options, the R0–R5
 * ladder, the direction, the threshold mode and the unit that mirrors the type)
 * belongs to the shared group definition. Tuning one employee's copy may only
 * change how much the KPI counts and when it is measured. Mirrors
 * `public.bu_console_scoring_model_lock`.
 */
import { resolveKpiScoringModel, type KpiScoringInput } from '@/lib/kpiScoringModel';

/** Fields tunable for every KPI, whatever its scoring model. */
export const ROW_SCOPE_FIELDS = [
  'weightage', 'target_value', 'frequency', 'source_of_data',
  'frequency_cycle_start', 'day_count_type',
] as const;

/** Fields that only make sense for a value-based (numeric) KPI. */
export const ROW_NUMERIC_ONLY_FIELDS = [
  'uom', 'criteria', 'r5', 'r4', 'r3', 'r2', 'r1', 'r0',
] as const;

/** Never per-employee: changing these would fork the group's scoring model. */
export const GROUP_OWNED_FIELDS = [
  'uom_type', 'qualitative_options', 'threshold_mode',
  ...ROW_NUMERIC_ONLY_FIELDS,
] as const;

export function isQualitativeKpi(kpi: KpiScoringInput | null | undefined): boolean {
  const t = resolveKpiScoringModel(kpi).uomType;
  return t === 'binary' || t === 'tiered';
}

/** Editable field list for the tuning dialog, narrowed by the KPI's type. */
export function rowEditableFields(kpi: KpiScoringInput | null | undefined): string[] {
  return isQualitativeKpi(kpi)
    ? [...ROW_SCOPE_FIELDS]
    : [...ROW_SCOPE_FIELDS, ...ROW_NUMERIC_ONLY_FIELDS];
}

/**
 * Client mirror of the server guard: the reason a change set must not be saved
 * per employee, or `null` when it is safe.
 */
export function scoringModelLockReason(
  kpi: KpiScoringInput | null | undefined,
  changes: Record<string, unknown>,
): string | null {
  const keys = Object.keys(changes ?? {});
  if (keys.length === 0) return null;
  if (keys.some((k) => k === 'uom_type' || k === 'qualitative_options')) {
    return 'The KPI type and its scoring options are shared — change them from "Edit definition".';
  }
  if (isQualitativeKpi(kpi) && keys.some((k) => (GROUP_OWNED_FIELDS as readonly string[]).includes(k))) {
    return 'This KPI is scored from its Yes/No or tiered options — the rating ladder cannot be tuned per employee.';
  }
  return null;
}
