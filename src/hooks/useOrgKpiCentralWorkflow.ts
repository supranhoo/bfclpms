/**
 * ADR-302 — Performance Console: central KPI value workflow (client layer).
 *
 * Thin wrappers over the ADR-301 SECURITY DEFINER RPCs. Every write runs with
 * `p_dry_run: true` first so the caller can show the server's own preview
 * before committing — the same preview-first contract the rest of the console
 * uses. No business logic lives here; authorisation and score integrity stay
 * server-side (POLICY §CONSOLE-CENTRAL-APPROVAL-SSOT).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import type {
  CentralChainStep,
  CentralDecision,
  CentralPropagationMode,
  CentralValueRow,
} from '@/lib/review/centralApprovalModel';

export interface CentralKpiIdentity {
  categoryId: string | undefined;
  kraName: string | undefined;
  kpiName: string | undefined;
}

export interface CentralChainConfig {
  authorized: boolean;
  is_central: boolean;
  propagation_mode: CentralPropagationMode;
  cutoff_day: number | null;
  steps: CentralChainStep[];
}

const CHAIN_KEY = 'org-kpi-central-chain';
const ROW_KEY = 'org-kpi-central-row';
const TRAIL_KEY = 'org-kpi-central-trail';

/** Registry + effective chain for one KPI identity. */
export function useOrgKpiCentralChain(identity: CentralKpiIdentity) {
  const { isReady, user } = useAuth();
  const { categoryId, kraName, kpiName } = identity;
  return useQuery({
    queryKey: [CHAIN_KEY, categoryId, kraName, kpiName, user?.id],
    enabled: isReady && !!user && !!categoryId && !!kraName && !!kpiName,
    staleTime: 60_000,
    queryFn: async (): Promise<CentralChainConfig> => {
      const { data, error } = await supabase.rpc('org_kpi_chain_list' as any, {
        p_category_id: categoryId,
        p_kra_name: kraName,
        p_kpi_name: kpiName,
      });
      if (error) throw error;
      const res = (data ?? {}) as any;
      return {
        authorized: !!res.authorized,
        is_central: !!res.is_central,
        propagation_mode: (res.propagation_mode ?? 'central_fed') as CentralPropagationMode,
        cutoff_day: res.cutoff_day ?? null,
        steps: (res.steps ?? []) as CentralChainStep[],
      };
    },
  });
}

/** The org-scope `org_kpi_values` row that carries the central number. */
export function useOrgKpiCentralRow(
  identity: CentralKpiIdentity,
  reviewPeriod: string | undefined,
  reviewYear: number | undefined,
  enabled = true,
) {
  const { isReady, user } = useAuth();
  const { categoryId, kraName, kpiName } = identity;
  return useQuery({
    queryKey: [ROW_KEY, categoryId, kraName, kpiName, reviewPeriod, reviewYear, user?.id],
    enabled:
      isReady && !!user && enabled &&
      !!categoryId && !!kraName && !!kpiName && !!reviewPeriod && !!reviewYear,
    staleTime: 30_000,
    queryFn: async (): Promise<CentralValueRow | null> => {
      const { data, error } = await supabase
        .from('org_kpi_values')
        .select(
          'id, achieved_value, target_value, remarks, is_na, workflow_stage, current_step, ' +
          'submitted_at, propagation_mode, sent_back_reason, sent_back_at, updated_at',
        )
        .eq('category_id', categoryId as string)
        .eq('kra_name', kraName as string)
        .eq('kpi_name', kpiName as string)
        .eq('review_period', reviewPeriod as string)
        .eq('review_year', reviewYear as number)
        .is('employee_id', null)
        .is('department_id', null)
        .maybeSingle();
      if (error) throw error;
      return (data as any as CentralValueRow) ?? null;
    },
  });
}

/** Immutable decision trail for one value row. */
export function useOrgKpiApprovalTrail(okvId: string | null | undefined) {
  const { isReady, user } = useAuth();
  return useQuery({
    queryKey: [TRAIL_KEY, okvId, user?.id],
    enabled: isReady && !!user && !!okvId,
    staleTime: 30_000,
    queryFn: async (): Promise<CentralDecision[]> => {
      const { data, error } = await supabase
        .from('org_kpi_approvals')
        .select('id, step_no, step_label, decision, actor_id, comment, decided_at')
        .eq('okv_id', okvId as string)
        .order('decided_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as any as CentralDecision[];
    },
  });
}

/** Is the current user a registered data owner for this KPI? */
export function useIsOrgKpiDataOwner(identity: CentralKpiIdentity) {
  const { isReady, user } = useAuth();
  const { categoryId, kraName, kpiName } = identity;
  return useQuery({
    queryKey: ['org-kpi-is-data-owner', categoryId, kraName, kpiName, user?.id],
    enabled: isReady && !!user && !!categoryId && !!kraName && !!kpiName,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from('org_kpi_data_owners')
        .select('id')
        .eq('owner_id', user!.id)
        .eq('category_id', categoryId as string)
        .eq('kra_name', kraName as string)
        .eq('kpi_name', kpiName as string)
        .limit(1);
      if (error) throw error;
      return (data ?? []).length > 0;
    },
  });
}

function useInvalidateCentral() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: [ROW_KEY] });
    qc.invalidateQueries({ queryKey: [TRAIL_KEY] });
    qc.invalidateQueries({ queryKey: [CHAIN_KEY] });
    qc.invalidateQueries({ queryKey: ['org-kpi-values'] });
    qc.invalidateQueries({ queryKey: ['bu-console-kpi-detail'] });
    qc.invalidateQueries({ queryKey: ['bu-console-tree'] });
  };
}

export interface SubmitValueArgs {
  okvId: string;
  achievedValue: number | null;
  remarks: string | null;
  dryRun: boolean;
}

/** `org_kpi_submit_value` — provider hands the number to the ladder. */
export function useOrgKpiSubmitValue() {
  const invalidate = useInvalidateCentral();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (args: SubmitValueArgs) => {
      const { data, error } = await supabase.rpc('org_kpi_submit_value' as any, {
        p_okv_id: args.okvId,
        p_achieved_value: args.achievedValue,
        p_remarks: args.remarks,
        p_evidence_urls: null,
        p_dry_run: args.dryRun,
      });
      if (error) throw error;
      return data as any;
    },
    onSuccess: (res, vars) => {
      if (!vars.dryRun) invalidate();
    },
    onError: (err: Error) => {
      toast({ title: 'Submit failed', description: err.message, variant: 'destructive' });
    },
  });
}

export interface DecideArgs {
  okvId: string;
  decision: 'approved' | 'sent_back';
  comment: string | null;
  dryRun: boolean;
}

/** `org_kpi_decide` — approve or send back at the current step. */
export function useOrgKpiDecide() {
  const invalidate = useInvalidateCentral();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (args: DecideArgs) => {
      const { data, error } = await supabase.rpc('org_kpi_decide' as any, {
        p_okv_id: args.okvId,
        p_decision: args.decision,
        p_comment: args.comment,
        p_dry_run: args.dryRun,
      });
      if (error) throw error;
      return data as any;
    },
    onSuccess: (res, vars) => {
      if (!vars.dryRun) invalidate();
    },
    onError: (err: Error) => {
      toast({ title: 'Decision failed', description: err.message, variant: 'destructive' });
    },
  });
}

/** `org_kpi_finalise` — fan the approved value out to mapped employees. */
export function useOrgKpiFinalise() {
  const invalidate = useInvalidateCentral();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ okvId, dryRun }: { okvId: string; dryRun: boolean }) => {
      const { data, error } = await supabase.rpc('org_kpi_finalise' as any, {
        p_okv_id: okvId,
        p_dry_run: dryRun,
      });
      if (error) throw error;
      return data as any;
    },
    onSuccess: (res, vars) => {
      if (!vars.dryRun) invalidate();
    },
    onError: (err: Error) => {
      toast({ title: 'Propagation failed', description: err.message, variant: 'destructive' });
    },
  });
}

export interface ChainUpsertArgs {
  categoryId: string;
  kraName: string;
  kpiName: string;
  steps: Array<{
    step_no: number;
    step_kind: 'provider' | 'approver';
    label: string;
    approver_id: string | null;
    approver_role: string | null;
  }>;
  propagationMode: CentralPropagationMode;
  cutoffDay: number | null;
  effectiveFrom: string;
}

/** `org_kpi_chain_upsert` — admin registers the KPI and its ladder. */
export function useOrgKpiChainUpsert() {
  const invalidate = useInvalidateCentral();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (args: ChainUpsertArgs) => {
      const { data, error } = await supabase.rpc('org_kpi_chain_upsert' as any, {
        p_category_id: args.categoryId,
        p_kra_name: args.kraName,
        p_kpi_name: args.kpiName,
        p_steps: args.steps as any,
        p_propagation_mode: args.propagationMode,
        p_cutoff_day: args.cutoffDay,
        p_effective_from: args.effectiveFrom,
      });
      if (error) throw error;
      const res = data as any;
      if (res && res.authorized === false) {
        throw new Error('Only an administrator can configure a central approval chain.');
      }
      return res;
    },
    onSuccess: (res) => {
      invalidate();
      toast({
        title: 'Central approval saved',
        description: `${res?.steps_saved ?? 0} step(s) effective from ${res?.effective_from ?? ''}.`,
      });
    },
    onError: (err: Error) => {
      toast({ title: 'Could not save chain', description: err.message, variant: 'destructive' });
    },
  });
}
