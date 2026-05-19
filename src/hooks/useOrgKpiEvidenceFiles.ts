import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

export interface OrgKpiEvidenceFile {
  url: string;
  label: string | null;
  added_by: string | null;
  added_at: string | null;
  /** Optional list of employee ids this file applies to. Empty/undefined = applies to everyone in scope. */
  applies_to_employee_ids?: string[];
  /** Optional list of department ids this file applies to. Empty/undefined = applies to everyone in scope. */
  applies_to_department_ids?: string[];
}

export interface OrgKpiEvidenceTargetingRow {
  employee_id: string;
  employee_name: string;
  department_id: string | null;
  department_name: string;
  kpi_id: string;
  kpi_status: string;
  expected_files: OrgKpiEvidenceFile[];
  current_urls: string[];
  drift_kind: 'in_sync' | 'not_propagated' | 'missing_files' | 'extra_files' | 'mismatch';
}

/**
 * Per-employee distribution preview for an Org KPI.
 * Returns who is mapped, what files they SHOULD have (after per-file targeting filter)
 * and what files they CURRENTLY have on their review_submission row.
 */
export function useOrgKpiEvidenceTargeting(okvId: string | null | undefined) {
  const { isReady, user } = useAuth();
  return useQuery({
    queryKey: ['org-kpi-evidence-targeting', okvId, user?.id],
    enabled: isReady && !!user && !!okvId,
    queryFn: async (): Promise<OrgKpiEvidenceTargetingRow[]> => {
      const { data, error } = await supabase.rpc('org_kpi_evidence_targeting' as any, {
        p_okv_id: okvId as string,
      });
      if (error) throw error;
      return ((data as any[]) || []) as OrgKpiEvidenceTargetingRow[];
    },
  });
}

/**
 * Fetch the rich evidence_files array for a single org_kpi_values row.
 * Falls back to the legacy evidence_url / evidence_urls projection if the
 * row predates the multi-file column (defensive — the BEFORE INSERT trigger
 * also seeds evidence_files from legacy values on the next write).
 */
export function useOrgKpiEvidenceFiles(okvId: string | null | undefined) {
  const { isReady, user } = useAuth();
  return useQuery({
    queryKey: ['org-kpi-evidence-files', okvId, user?.id],
    enabled: isReady && !!user && !!okvId,
    queryFn: async (): Promise<OrgKpiEvidenceFile[]> => {
      const { data, error } = await supabase
        .from('org_kpi_values')
        .select('evidence_files, evidence_url, evidence_urls')
        .eq('id', okvId as string)
        .maybeSingle();
      if (error) throw error;
      if (!data) return [];
      const rich = Array.isArray((data as any).evidence_files)
        ? ((data as any).evidence_files as OrgKpiEvidenceFile[])
        : [];
      if (rich.length > 0) return rich;
      // Legacy fallback
      const urls: string[] = Array.isArray((data as any).evidence_urls)
        ? ((data as any).evidence_urls as string[])
        : [];
      const merged = urls.length > 0 ? urls : (data.evidence_url ? [data.evidence_url] : []);
      return merged.map<OrgKpiEvidenceFile>(u => ({
        url: u, label: null, added_by: null, added_at: null,
      }));
    },
  });
}

/**
 * Replace the entire evidence_files array for an OKV row. The DB trigger
 * keeps evidence_url / evidence_urls in sync automatically.
 */
export function useUpsertOrgKpiEvidenceFiles() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ okvId, files }: { okvId: string; files: OrgKpiEvidenceFile[] }) => {
      const { error } = await supabase
        .from('org_kpi_values')
        .update({ evidence_files: files as any })
        .eq('id', okvId);
      if (error) throw error;
      return { okvId, count: files.length };
    },
    onSuccess: ({ okvId }) => {
      qc.invalidateQueries({ queryKey: ['org-kpi-evidence-files', okvId] });
      qc.invalidateQueries({ queryKey: ['org-kpi-values'] });
      qc.invalidateQueries({ queryKey: ['org-kpi-evidence-parity'] });
      qc.invalidateQueries({ queryKey: ['org-kpi-evidence-targeting', okvId] });
    },
    onError: (err: Error) => {
      toast({ title: 'Failed to update supporting files', description: err.message, variant: 'destructive' });
    },
  });
}

/**
 * Resolve the org_kpi_values row id for an org-scope KPI identity tuple.
 * Returns null if no row exists yet (e.g. nothing has been entered).
 */
export function useOrgScopeOkvId(args: {
  categoryId: string | undefined;
  kraName: string | undefined;
  kpiName: string | undefined;
  reviewPeriod: string | undefined;
  reviewYear: number | undefined;
  enabled?: boolean;
}) {
  const { isReady, user } = useAuth();
  const { categoryId, kraName, kpiName, reviewPeriod, reviewYear, enabled = true } = args;
  return useQuery({
    queryKey: ['org-scope-okv-id', categoryId, kraName, kpiName, reviewPeriod, reviewYear, user?.id],
    enabled:
      isReady && !!user && enabled &&
      !!categoryId && !!kraName && !!kpiName && !!reviewPeriod && !!reviewYear,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from('org_kpi_values')
        .select('id')
        .eq('category_id', categoryId as string)
        .eq('kra_name', kraName as string)
        .eq('kpi_name', kpiName as string)
        .eq('review_period', reviewPeriod as string)
        .eq('review_year', reviewYear as number)
        .is('employee_id', null)
        .maybeSingle();
      if (error) throw error;
      return data?.id ?? null;
    },
  });
}

export interface OrgKpiEvidenceParityRow {
  okv_id: string;
  category_id: string;
  kra_name: string;
  kpi_name: string;
  total_emps: number;
  in_sync: number;
  drift_value: number;
  drift_evidence: number;
  not_propagated: number;
}

export function useOrgKpiEvidenceParity(reviewPeriod?: string, reviewYear?: number) {
  const { isReady, user } = useAuth();
  return useQuery({
    queryKey: ['org-kpi-evidence-parity', reviewPeriod, reviewYear, user?.id],
    enabled: isReady && !!user && !!reviewPeriod && !!reviewYear,
    queryFn: async (): Promise<Map<string, OrgKpiEvidenceParityRow>> => {
      const { data, error } = await supabase.rpc('org_kpi_evidence_parity' as any, {
        p_review_period: reviewPeriod,
        p_review_year: reviewYear,
      });
      if (error) throw error;
      const map = new Map<string, OrgKpiEvidenceParityRow>();
      ((data as any[]) || []).forEach(row => map.set(row.okv_id, row));
      return map;
    },
  });
}

/**
 * Resync OKV evidence into every mapped employee's review_submissions.
 *  - 'append_only'           : safe at any stage, only adds new URLs
 *  - 'replace_with_stepback' : full replace; rows past self_review are sent back
 */
export function useResyncOrgKpiEvidence() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ okvId, mode }: { okvId: string; mode: 'append_only' | 'replace_with_stepback' }) => {
      const { data, error } = await supabase.rpc('resync_org_kpi_evidence' as any, {
        p_okv_id: okvId,
        p_mode: mode,
      });
      if (error) throw error;
      return data as { pushed: number; skipped: number; stepped_back: number; details: any[] };
    },
    onSuccess: (res, vars) => {
      qc.invalidateQueries({ queryKey: ['org-kpi-evidence-parity'] });
      qc.invalidateQueries({ queryKey: ['org-kpi-values'] });
      qc.invalidateQueries({ queryKey: ['review-submissions'] });
      toast({
        title: 'Supporting files re-synced',
        description:
          `Updated ${res.pushed} employee row${res.pushed === 1 ? '' : 's'}` +
          (res.stepped_back > 0 ? `, stepped back ${res.stepped_back} for re-acknowledgement` : '') +
          (res.skipped > 0 ? `, ${res.skipped} already in sync` : '') +
          ` (${vars.mode === 'append_only' ? 'append only' : 'replace + step-back'}).`,
      });
    },
    onError: (err: Error) => {
      toast({ title: 'Resync failed', description: err.message, variant: 'destructive' });
    },
  });
}