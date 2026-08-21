/**
 * ADR-309 — KPI Data Ledger service layer.
 *
 * The only place the app talks to the ledger RPCs. Components never call
 * supabase directly for ledger data, and every write is preview-first where the
 * server supports it (bulk import). Authorisation is entirely server-side.
 */
import { supabase } from '@/integrations/supabase/client';
import type {
  LedgerBundle, LedgerColumn, LedgerDef, LedgerRow, LedgerValidation,
} from '@/lib/review/kpiLedgerModel';

export interface LedgerIdentity {
  categoryId: string;
  kraName: string;
  kpiName: string;
}

export interface LedgerRowsPage {
  rows: LedgerRow[];
  total: number;
  limit: number;
  offset: number;
}

export interface ServerRollup {
  value: number | null;
  row_count: number;
  rule: string;
  sum_value?: number | null;
  sum_target?: number | null;
  sum_weight?: number | null;
  working: string;
}

export interface BulkImportResult {
  dry_run: boolean;
  created: number;
  updated: number;
  errors: Array<{ index: number; error: string }>;
}

export async function fetchLedgerBundle(id: LedgerIdentity): Promise<LedgerBundle | null> {
  const { data, error } = await supabase.rpc('org_kpi_dataset_get' as any, {
    p_category_id: id.categoryId,
    p_kra_name: id.kraName,
    p_kpi_name: id.kpiName,
  });
  if (error) throw error;
  if (!data) return null;
  const res = data as any;
  return {
    def: res.def as LedgerDef,
    columns: ((res.columns ?? []) as LedgerColumn[]).slice().sort((a, b) => a.sort_order - b.sort_order),
  };
}

export interface UpsertDefInput extends LedgerIdentity {
  title: string;
  description?: string | null;
  granularity: LedgerDef['granularity'];
  rollupRule: LedgerDef['rollup_rule'];
  valueColumnKey: string | null;
  targetColumnKey: string | null;
  weightColumnKey: string | null;
  allowProviderOverride: boolean;
  columns: LedgerColumn[];
}

export async function upsertLedgerDef(input: UpsertDefInput): Promise<LedgerBundle | null> {
  const payload = {
    category_id: input.categoryId,
    kra_name: input.kraName,
    kpi_name: input.kpiName,
    title: input.title,
    description: input.description ?? null,
    granularity: input.granularity,
    rollup_rule: input.rollupRule,
    value_column_key: input.valueColumnKey,
    target_column_key: input.targetColumnKey,
    weight_column_key: input.weightColumnKey,
    allow_provider_override: input.allowProviderOverride,
    columns: input.columns.map((c, i) => ({
      column_key: c.column_key,
      label: c.label,
      data_type: c.data_type,
      unit: c.unit ?? null,
      is_required: c.is_required,
      is_key: c.is_key,
      editable_by: c.editable_by,
      formula: c.formula ?? null,
      display_format: c.display_format ?? null,
      options: c.options ?? [],
      sort_order: c.sort_order ?? (i + 1) * 10,
    })),
  };
  const { data, error } = await supabase.rpc('org_kpi_dataset_upsert_def' as any, { p_payload: payload });
  if (error) throw error;
  if (!data) return null;
  const res = data as any;
  return { def: res.def as LedgerDef, columns: (res.columns ?? []) as LedgerColumn[] };
}

export async function fetchLedgerRows(args: {
  datasetId: string;
  reviewYear?: number | null;
  reviewPeriod?: string | null;
  limit?: number;
  offset?: number;
}): Promise<LedgerRowsPage> {
  const { data, error } = await supabase.rpc('org_kpi_dataset_rows_read' as any, {
    p_dataset_id: args.datasetId,
    p_review_year: args.reviewYear ?? null,
    p_review_period: args.reviewPeriod ?? null,
    p_limit: args.limit ?? 100,
    p_offset: args.offset ?? 0,
  });
  if (error) throw error;
  const res = (data ?? {}) as any;
  return {
    rows: (res.rows ?? []) as LedgerRow[],
    total: Number(res.total ?? 0),
    limit: Number(res.limit ?? 100),
    offset: Number(res.offset ?? 0),
  };
}

export interface SaveRowInput {
  id?: string | null;
  datasetId: string;
  reviewPeriod: string;
  reviewYear: number;
  periodStart?: string | null;
  divisionId?: string | null;
  businessUnitId?: string | null;
  departmentId?: string | null;
  locationId?: string | null;
  pmsGradeId?: string | null;
  levelId?: string | null;
  employeeId?: string | null;
  scopeLabel?: string | null;
  impactScope?: Record<string, unknown>;
  values: Record<string, unknown>;
  reason?: string | null;
}

function toRowPayload(input: SaveRowInput) {
  return {
    id: input.id ?? null,
    dataset_id: input.datasetId,
    review_period: input.reviewPeriod,
    review_year: input.reviewYear,
    period_start: input.periodStart ?? null,
    division_id: input.divisionId ?? null,
    business_unit_id: input.businessUnitId ?? null,
    department_id: input.departmentId ?? null,
    location_id: input.locationId ?? null,
    pms_grade_id: input.pmsGradeId ?? null,
    level_id: input.levelId ?? null,
    employee_id: input.employeeId ?? null,
    scope_label: input.scopeLabel ?? null,
    impact_scope: input.impactScope ?? {},
    values: input.values ?? {},
    reason: input.reason ?? null,
  };
}

export async function saveLedgerRow(input: SaveRowInput): Promise<LedgerRow> {
  const { data, error } = await supabase.rpc('org_kpi_dataset_row_save' as any, {
    p_payload: toRowPayload(input),
  });
  if (error) throw error;
  return data as any as LedgerRow;
}

export async function deleteLedgerRow(rowId: string, reason: string | null): Promise<void> {
  const { error } = await supabase.rpc('org_kpi_dataset_row_delete' as any, {
    p_row_id: rowId,
    p_reason: reason,
  });
  if (error) throw error;
}

export async function bulkImportLedgerRows(args: {
  datasetId: string;
  rows: Array<Omit<SaveRowInput, 'datasetId'>>;
  dryRun: boolean;
}): Promise<BulkImportResult> {
  const { data, error } = await supabase.rpc('org_kpi_dataset_bulk_import' as any, {
    p_dataset_id: args.datasetId,
    p_rows: args.rows.map((r) => toRowPayload({ ...r, datasetId: args.datasetId })) as any,
    p_dry_run: args.dryRun,
  });
  if (error) throw error;
  return data as any as BulkImportResult;
}

export async function fetchServerRollup(args: {
  datasetId: string;
  reviewYear: number;
  reviewPeriod?: string | null;
}): Promise<ServerRollup> {
  const { data, error } = await supabase.rpc('org_kpi_dataset_rollup' as any, {
    p_dataset_id: args.datasetId,
    p_review_year: args.reviewYear,
    p_review_period: args.reviewPeriod ?? null,
  });
  if (error) throw error;
  return data as any as ServerRollup;
}

export async function fetchValidationState(args: {
  datasetId: string;
  reviewYear: number;
  reviewPeriod: string;
}): Promise<LedgerValidation | null> {
  const { data, error } = await supabase.rpc('org_kpi_dataset_validation_state' as any, {
    p_dataset_id: args.datasetId,
    p_review_year: args.reviewYear,
    p_review_period: args.reviewPeriod,
  });
  if (error) throw error;
  return (data as any as LedgerValidation) ?? null;
}

export async function validateLedgerPeriod(args: {
  datasetId: string;
  reviewYear: number;
  reviewPeriod: string;
  verdict: 'validated' | 'rejected';
  note: string | null;
}): Promise<{ id: string; row_count: number; verdict: string }> {
  const { data, error } = await supabase.rpc('org_kpi_dataset_validate' as any, {
    p_dataset_id: args.datasetId,
    p_review_year: args.reviewYear,
    p_review_period: args.reviewPeriod,
    p_verdict: args.verdict,
    p_note: args.note,
  });
  if (error) throw error;
  return data as any;
}
