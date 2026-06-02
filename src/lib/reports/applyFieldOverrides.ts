/**
 * Pure resolver — merges report_field_registry defaults with active overrides.
 * Mirrors the trigger rules: required fields cannot be hidden; non-renamable
 * fields keep their default label.
 */
import type { ReportFieldOverrideRow, ReportFieldRegistryRow, ResolvedReportField } from './types';

export function applyFieldOverrides(
  registry: ReportFieldRegistryRow[],
  overrides: ReportFieldOverrideRow[],
): ResolvedReportField[] {
  const overrideByKey = new Map<string, ReportFieldOverrideRow>();
  for (const o of overrides) {
    if (!o.is_active) continue;
    // last write wins per field within the same report
    overrideByKey.set(`${o.report_id}::${o.field_key}`, o);
  }

  return registry
    .map((reg) => {
      const o = overrideByKey.get(`${reg.report_id}::${reg.field_key}`);
      const labelOverridden = !!(o && o.custom_label && reg.is_renamable);
      const sortOverridden  = !!(o && o.custom_sort !== null && o.custom_sort !== undefined);
      const hiddenOverridden = !!(o && o.is_hidden && !reg.is_required);
      return {
        field_key: reg.field_key,
        label: labelOverridden ? (o!.custom_label as string) : reg.default_label,
        sort:  sortOverridden  ? (o!.custom_sort as number)  : reg.default_sort,
        is_hidden: hiddenOverridden,
        is_required: reg.is_required,
        is_renamable: reg.is_renamable,
        data_type: reg.data_type,
        is_overridden: labelOverridden || sortOverridden || hiddenOverridden,
      };
    })
    .sort((a, b) => a.sort - b.sort);
}

/** Convenience: resolved + visible (hidden fields stripped). */
export function applyAndFilter(
  registry: ReportFieldRegistryRow[],
  overrides: ReportFieldOverrideRow[],
): ResolvedReportField[] {
  return applyFieldOverrides(registry, overrides).filter((f) => !f.is_hidden);
}