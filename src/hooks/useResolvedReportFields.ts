import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { applyFieldOverrides } from '@/lib/reports/applyFieldOverrides';
import type {
  ReportFieldOverrideRow,
  ReportFieldRegistryRow,
  ReportRegistryRow,
  ResolvedReportField,
} from '@/lib/reports/types';

const STALE_MS = 5 * 60 * 1000;

async function fetchFlag(): Promise<boolean> {
  const { data, error } = await supabase
    .from('system_settings')
    .select('setting_value')
    .eq('setting_key', 'report_overrides_enabled')
    .maybeSingle();
  if (error || !data) return false;
  const v = data.setting_value as unknown;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v === 'true' || v === '"true"';
  return false;
}

async function fetchRegistry(): Promise<ReportRegistryRow[]> {
  const { data, error } = await supabase.from('report_registry' as any).select('*');
  if (error) throw error;
  return ((data ?? []) as unknown) as ReportRegistryRow[];
}

async function fetchFields(): Promise<ReportFieldRegistryRow[]> {
  const { data, error } = await supabase.from('report_field_registry' as any).select('*');
  if (error) throw error;
  return ((data ?? []) as unknown) as ReportFieldRegistryRow[];
}

async function fetchOverrides(): Promise<ReportFieldOverrideRow[]> {
  const { data, error } = await supabase
    .from('report_field_overrides' as any).select('*').eq('is_active', true);
  if (error) throw error;
  return ((data ?? []) as unknown) as ReportFieldOverrideRow[];
}

/** Master switch — when false, every consumer falls back to its defaults. */
export function useReportOverridesEnabled() {
  return useQuery({
    queryKey: ['report-overrides-enabled'],
    queryFn: fetchFlag,
    staleTime: STALE_MS,
  });
}

export function useReportRegistry() {
  return useQuery({
    queryKey: ['report-registry'],
    queryFn: fetchRegistry,
    staleTime: STALE_MS,
  });
}

export function useReportFieldRegistry() {
  return useQuery({
    queryKey: ['report-field-registry'],
    queryFn: fetchFields,
    staleTime: STALE_MS,
  });
}

export function useReportFieldOverridesAll() {
  return useQuery({
    queryKey: ['report-field-overrides-all'],
    queryFn: async () => {
      const { data, error } = await supabase.from('report_field_overrides' as any).select('*');
      if (error) throw error;
      return ((data ?? []) as unknown) as ReportFieldOverrideRow[];
    },
    staleTime: STALE_MS,
  });
}

/**
 * Consumer hook used by report pages. Pass the report's stable Report ID and
 * its hardcoded default field set. When the master flag is off or no override
 * exists, the defaults are returned unchanged — zero behaviour change.
 *
 * The `defaults` argument doubles as a safety net: if the registry hasn't been
 * seeded yet (or this report isn't catalogued) we still render something sane.
 */
export function useResolvedReportFields(
  reportId: string,
  defaults: ReadonlyArray<{ field_key: string; default_label: string; default_sort: number; is_required?: boolean; is_renamable?: boolean }>,
): ResolvedReportField[] {
  const { data: enabled } = useReportOverridesEnabled();
  const { data: registryRows } = useReportFieldRegistry();
  const { data: overrideRows } = useQuery({
    queryKey: ['report-field-overrides', reportId],
    enabled: !!enabled,
    staleTime: STALE_MS,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('report_field_overrides' as any)
        .select('*')
        .eq('report_id', reportId)
        .eq('is_active', true);
      if (error) throw error;
      return ((data ?? []) as unknown) as ReportFieldOverrideRow[];
    },
  });

  return useMemo<ResolvedReportField[]>(() => {
    // Build the registry rows for THIS report — prefer DB rows, fall back to defaults.
    const dbRows = (registryRows ?? []).filter((r) => r.report_id === reportId);
    const seed: ReportFieldRegistryRow[] = dbRows.length > 0
      ? dbRows
      : defaults.map((d) => ({
          report_id: reportId,
          field_key: d.field_key,
          default_label: d.default_label,
          default_sort: d.default_sort,
          is_required: d.is_required ?? false,
          is_renamable: d.is_renamable ?? true,
          data_type: null,
        }));

    if (!enabled) {
      // Bypass overrides entirely.
      return applyFieldOverrides(seed, []);
    }
    return applyFieldOverrides(seed, overrideRows ?? []);
  }, [registryRows, overrideRows, enabled, reportId, defaults]);
}