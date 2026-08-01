import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ExemptionPolicyRow, ExemptionRecord } from '@/lib/annualReview/effectiveEligibility';

/**
 * ADR-221 — master exemption policy + per-cycle exemption records.
 * The tables are new, so the generated types are not aware of them yet.
 */

export function useEligibilityExemptionPolicy() {
  return useQuery({
    queryKey: ['ar-eligibility-exemption-policy'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ExemptionPolicyRow[]> => {
      const { data, error } = await (supabase as any)
        .from('annual_review_eligibility_exemption_policy')
        .select('id, question_key, label, is_exemptable, requires_reason, is_protected, sort_order, notes')
        .order('sort_order', { ascending: true })
        .order('label', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ExemptionPolicyRow[];
    },
  });
}

/**
 * ADR-223 — admin/HR management of the exemption rule master list.
 * Every write is audited server-side by `trg_ar_elig_policy_audit`.
 */
export function useExemptionPolicyMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['ar-eligibility-exemption-policy'] });

  const save = useMutation({
    mutationFn: async (row: ExemptionPolicyRow) => {
      const { data: auth } = await supabase.auth.getUser();
      const payload = {
        question_key: row.question_key,
        label: row.label,
        is_exemptable: row.is_exemptable,
        requires_reason: row.requires_reason ?? true,
        is_protected: row.is_protected ?? false,
        sort_order: row.sort_order ?? 100,
        notes: row.notes ?? null,
        updated_by: auth.user?.id ?? null,
      };
      if (row.id) {
        const { error } = await (supabase as any)
          .from('annual_review_eligibility_exemption_policy')
          .update(payload)
          .eq('id', row.id);
        if (error) throw error;
        return;
      }
      const { error } = await (supabase as any)
        .from('annual_review_eligibility_exemption_policy')
        .insert(payload);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('annual_review_eligibility_exemption_policy')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { save, remove };
}

/** All exemptions for a cycle, keyed by instance id. */
export function useEligibilityExemptions(cycleId?: string) {
  return useQuery({
    queryKey: ['ar-eligibility-exemptions', cycleId],
    enabled: Boolean(cycleId),
    staleTime: 30_000,
    queryFn: async (): Promise<Record<string, ExemptionRecord[]>> => {
      const { data, error } = await (supabase as any)
        .from('annual_review_eligibility_exemptions')
        .select('id, instance_id, criterion_id, criterion_name, status, reason, decision_note, decided_at, source, bulk_run_id, penalty_from_percent, penalty_to_percent')
        .eq('cycle_id', cycleId);
      if (error) throw error;
      const out: Record<string, ExemptionRecord[]> = {};
      for (const r of (data ?? []) as ExemptionRecord[]) {
        (out[r.instance_id] ??= []).push(r);
      }
      return out;
    },
  });
}

export interface RequestExemptionInput {
  instance_id: string;
  cycle_id?: string | null;
  employee_id?: string | null;
  criterion_id: string;
  criterion_name: string;
  reason: string;
  /** Approve immediately (approver roles only). */
  approve?: boolean;
}

export function useExemptionMutations(cycleId?: string) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['ar-eligibility-exemptions', cycleId] });

  const request = useMutation({
    mutationFn: async (input: RequestExemptionInput) => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id ?? null;
      const payload: Record<string, unknown> = {
        instance_id: input.instance_id,
        cycle_id: input.cycle_id ?? null,
        employee_id: input.employee_id ?? null,
        criterion_id: input.criterion_id,
        criterion_name: input.criterion_name,
        reason: input.reason,
        requested_by: uid,
        status: input.approve ? 'approved' : 'pending',
        ...(input.approve ? { decided_by: uid, decided_at: new Date().toISOString() } : {}),
      };
      const { error } = await (supabase as any)
        .from('annual_review_eligibility_exemptions')
        .upsert(payload, { onConflict: 'instance_id,criterion_id' });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const decide = useMutation({
    mutationFn: async (args: { id: string; status: 'approved' | 'rejected'; note?: string }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await (supabase as any)
        .from('annual_review_eligibility_exemptions')
        .update({
          status: args.status,
          decision_note: args.note ?? null,
          decided_by: auth.user?.id ?? null,
          decided_at: new Date().toISOString(),
        })
        .eq('id', args.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('annual_review_eligibility_exemptions')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { request, decide, revoke };
}