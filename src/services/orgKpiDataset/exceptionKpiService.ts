/**
 * ADR-317 — Exception KPI service layer.
 *
 * Only place the app talks to the exception-KPI RPCs. Every write is
 * preview-first: seeding and releasing both accept a dry run so the officer
 * sees the impact before anything reaches an employee scorecard.
 * Authorisation lives entirely in the RPCs.
 */
import { supabase } from '@/integrations/supabase/client';
import type {
  ExceptionConfig, ExceptionDirection, ExceptionReleaseResult, ExceptionReleaseRun,
  ExceptionScopeDimension, ExceptionSeedResult, ExceptionSummary, LedgerEntryMode,
} from '@/lib/review/exceptionKpiModel';

export async function setExceptionConfig(args: {
  datasetId: string;
  entryMode: LedgerEntryMode;
  scopeDimension: ExceptionScopeDimension | null;
  cleanValue: number | null;
  direction: ExceptionDirection;
}): Promise<ExceptionConfig> {
  const { data, error } = await supabase.rpc('org_kpi_dataset_set_exception_config' as any, {
    p_dataset_id: args.datasetId,
    p_entry_mode: args.entryMode,
    p_scope_dimension: args.scopeDimension,
    p_clean_value: args.cleanValue,
    p_exception_direction: args.direction,
  });
  if (error) throw error;
  return data as any as ExceptionConfig;
}

export async function seedScopeRows(args: {
  datasetId: string;
  reviewPeriod: string;
  reviewYear: number;
  mappedOnly: boolean;
  dryRun: boolean;
}): Promise<ExceptionSeedResult> {
  const { data, error } = await supabase.rpc('org_kpi_dataset_seed_scope_rows' as any, {
    p_dataset_id: args.datasetId,
    p_review_period: args.reviewPeriod,
    p_review_year: args.reviewYear,
    p_mapped_only: args.mappedOnly,
    p_dry_run: args.dryRun,
  });
  if (error) throw error;
  return data as any as ExceptionSeedResult;
}

export async function fetchExceptionSummary(args: {
  datasetId: string;
  reviewYear: number;
  reviewPeriod: string;
}): Promise<ExceptionSummary> {
  const { data, error } = await supabase.rpc('org_kpi_dataset_exception_summary' as any, {
    p_dataset_id: args.datasetId,
    p_review_year: args.reviewYear,
    p_review_period: args.reviewPeriod,
  });
  if (error) throw error;
  return data as any as ExceptionSummary;
}

export async function releaseExceptionPeriod(args: {
  datasetId: string;
  reviewYear: number;
  reviewPeriod: string;
  dryRun: boolean;
  overwritePolicy?: 'pre_review_only' | 'overwrite_and_stepback';
  maxEmployees?: number;
}): Promise<ExceptionReleaseResult> {
  const { data, error } = await supabase.rpc('org_kpi_dataset_release_scoped' as any, {
    p_dataset_id: args.datasetId,
    p_review_year: args.reviewYear,
    p_review_period: args.reviewPeriod,
    p_dry_run: args.dryRun,
    p_overwrite_policy: args.overwritePolicy ?? 'pre_review_only',
    p_max_employees: args.maxEmployees ?? 5000,
  });
  if (error) throw error;
  return data as any as ExceptionReleaseResult;
}

export async function fetchLastReleaseRun(args: {
  datasetId: string;
  reviewYear: number;
  reviewPeriod: string;
}): Promise<ExceptionReleaseRun | null> {
  const { data, error } = await supabase.rpc('org_kpi_dataset_release_state' as any, {
    p_dataset_id: args.datasetId,
    p_review_year: args.reviewYear,
    p_review_period: args.reviewPeriod,
  });
  if (error) throw error;
  return (data as any as ExceptionReleaseRun) ?? null;
}
