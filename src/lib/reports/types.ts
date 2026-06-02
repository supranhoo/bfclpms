/**
 * Report Registry / Field Override types (Phase 4).
 *
 * Identity is `report_id` (e.g. RPT-PERF-001) and `field_key` per report.
 * Both are IMMUTABLE — they are permission keys and audit keys.
 */

export type ReportRegistryRow = {
  report_id: string;
  report_key: string;
  module_prefix: string;
  display_name: string;
  canonical_route: string;
  menu_key: string | null;
  description: string | null;
  is_active: boolean;
  sort_order: number;
};

export type ReportFieldRegistryRow = {
  id?: string;
  report_id: string;
  field_key: string;
  default_label: string;
  default_sort: number;
  is_required: boolean;
  is_renamable: boolean;
  data_type: string | null;
};

export type ReportFieldOverrideRow = {
  id: string;
  report_id: string;
  field_key: string;
  client_id: string | null;
  custom_label: string | null;
  custom_sort: number | null;
  is_hidden: boolean;
  is_active: boolean;
  updated_by: string | null;
  updated_at: string;
};

export type ResolvedReportField = {
  field_key: string;
  label: string;
  sort: number;
  is_hidden: boolean;
  is_required: boolean;
  is_renamable: boolean;
  data_type: string | null;
  is_overridden: boolean;
};