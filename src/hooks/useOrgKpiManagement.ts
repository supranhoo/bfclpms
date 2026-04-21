import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface OrgKpiIdentifier {
  categoryId: string;
  kraName: string;
  kpiName: string;
  reviewPeriod: string;
  reviewYear: number;
}

/**
 * Add employees to an Org KPI.
 * If the employee already has a matching KPI record, set is_org_level = true.
 * Otherwise, insert a new KPI record copying config from an existing org-level record.
 */
export function useAddEmployeesToOrgKpi() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      identifier,
      employeeIds,
    }: {
      identifier: OrgKpiIdentifier;
      employeeIds: string[];
    }) => {
      const { categoryId, kraName, kpiName, reviewPeriod, reviewYear } = identifier;

      // Get a reference KPI record to copy config from
      const { data: refKpi, error: refError } = await supabase
        .from('kpis')
        .select('*')
        .eq('category_id', categoryId)
        .eq('kra_name', kraName)
        .eq('kpi_name', kpiName)
        .eq('review_period', reviewPeriod)
        .eq('review_year', reviewYear)
        .eq('is_org_level', true)
        .limit(1)
        .single();

      if (refError || !refKpi) throw new Error('Could not find reference Org KPI to copy configuration');

      let added = 0;
      let updated = 0;

      for (const empId of employeeIds) {
        // Check if employee already has this KPI
        const { data: existing } = await supabase
          .from('kpis')
          .select('id, is_org_level')
          .eq('category_id', categoryId)
          .eq('kra_name', kraName)
          .eq('kpi_name', kpiName)
          .eq('review_period', reviewPeriod)
          .eq('review_year', reviewYear)
          .eq('employee_id', empId)
          .maybeSingle();

        if (existing) {
          // Update existing record
          const { error } = await supabase
            .from('kpis')
            .update({ is_org_level: true, org_level_scope: refKpi.org_level_scope })
            .eq('id', existing.id);
          if (error) throw error;
          updated++;
        } else {
          // Insert new record copying from reference
          const { error } = await supabase
            .from('kpis')
            .insert({
              category_id: categoryId,
              kra_name: kraName,
              kpi_name: kpiName,
              review_period: reviewPeriod,
              review_year: reviewYear,
              employee_id: empId,
              is_org_level: true,
              org_level_scope: refKpi.org_level_scope,
              target_value: refKpi.target_value,
              weightage: refKpi.weightage,
              criteria: refKpi.criteria,
              uom: refKpi.uom,
              uom_type: refKpi.uom_type,
              frequency: refKpi.frequency,
              sub_frequency: refKpi.sub_frequency,
              source_of_data: refKpi.source_of_data,
              r0: refKpi.r0,
              r1: refKpi.r1,
              r2: refKpi.r2,
              r3: refKpi.r3,
              r4: refKpi.r4,
              r5: refKpi.r5,
              threshold_mode: refKpi.threshold_mode,
              qualitative_options: refKpi.qualitative_options,
              ref_code: refKpi.ref_code,
              status: 'kra_set',
            });
          if (error) throw error;
          added++;
        }
      }

      return { added, updated };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['org-kpi-full-mapping'] });
      queryClient.invalidateQueries({ queryKey: ['org-level-kpis'] });
      toast({
        title: 'Employees added',
        description: `${result.added} new, ${result.updated} updated`,
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to add employees', description: error.message, variant: 'destructive' });
    },
  });
}

/**
 * Remove an employee from an Org KPI by setting is_org_level = false.
 * Optionally delete the KPI record entirely.
 */
export function useRemoveEmployeeFromOrgKpi() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      kpiId,
      hardDelete = false,
    }: {
      kpiId: string;
      employeeName: string;
      hardDelete?: boolean;
    }) => {
      if (hardDelete) {
        const { error } = await supabase.from('kpis').delete().eq('id', kpiId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('kpis')
          .update({ is_org_level: false })
          .eq('id', kpiId);
        if (error) throw error;
      }
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['org-kpi-full-mapping'] });
      queryClient.invalidateQueries({ queryKey: ['org-level-kpis'] });
      toast({
        title: 'Employee removed',
        description: `${vars.employeeName} unlinked from Org KPI`,
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to remove employee', description: error.message, variant: 'destructive' });
    },
  });
}

export type ScopeCascadeMode = 'current_only' | 'current_and_future';

interface CascadePeriodResult {
  period: string;
  year: number;
  old_scope?: string;
  new_scope?: string;
  kpis_updated?: number;
  okv_migration?: { action: string; aggregated: number; split: number };
  preview?: boolean;
}

interface CascadeResponse {
  dry_run: boolean;
  periods: CascadePeriodResult[];
  skipped: Array<{ period: string; year: number; reason: string }>;
}

/**
 * Change the org_level_scope on all matching KPI records for a given Org KPI.
 * When cascadeMode = 'current_and_future', applies the same change to all
 * unlocked open future periods within the same fiscal year (July→June) and
 * migrates org_kpi_values via aggregation/split.
 */
export function useChangeOrgKpiScope() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      identifier,
      newScope,
      cascadeMode = 'current_only',
    }: {
      identifier: OrgKpiIdentifier;
      newScope: 'organization' | 'department' | 'employee';
      cascadeMode?: ScopeCascadeMode;
    }): Promise<CascadeResponse> => {
      const { categoryId, kraName, kpiName, reviewPeriod, reviewYear } = identifier;
      const { data: { user } } = await supabase.auth.getUser();

      const { data, error } = await supabase.rpc('change_org_kpi_scope_cascading', {
        p_category_id: categoryId,
        p_kra_name: kraName,
        p_kpi_name: kpiName,
        p_base_period: reviewPeriod,
        p_base_year: reviewYear,
        p_new_scope: newScope,
        p_cascade_forward: cascadeMode === 'current_and_future',
        p_dry_run: false,
        p_triggered_by: user?.id ?? null,
      });

      if (error) throw error;
      return data as unknown as CascadeResponse;
    },
    onSuccess: (result, vars) => {
      queryClient.invalidateQueries({ queryKey: ['org-kpi-full-mapping'] });
      queryClient.invalidateQueries({ queryKey: ['org-level-kpis'] });
      const periodsTouched = result.periods.length;
      const skipped = result.skipped.length;
      toast({
        title: 'Scope updated',
        description: `Changed to "${vars.newScope}" across ${periodsTouched} period(s)${skipped ? ` · ${skipped} skipped (locked)` : ''}`,
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to change scope', description: error.message, variant: 'destructive' });
    },
  });
}

/**
 * Dry-run preview of a cascading scope change — returns affected periods
 * and any skipped (locked) periods without writing.
 */
export function useScopeCascadePreview() {
  return useMutation({
    mutationFn: async ({
      identifier,
      newScope,
      cascadeForward,
    }: {
      identifier: OrgKpiIdentifier;
      newScope: 'organization' | 'department' | 'employee';
      cascadeForward: boolean;
    }): Promise<CascadeResponse> => {
      const { categoryId, kraName, kpiName, reviewPeriod, reviewYear } = identifier;
      const { data, error } = await supabase.rpc('change_org_kpi_scope_cascading', {
        p_category_id: categoryId,
        p_kra_name: kraName,
        p_kpi_name: kpiName,
        p_base_period: reviewPeriod,
        p_base_year: reviewYear,
        p_new_scope: newScope,
        p_cascade_forward: cascadeForward,
        p_dry_run: true,
        p_triggered_by: null,
      });
      if (error) throw error;
      return data as unknown as CascadeResponse;
    },
  });
}
