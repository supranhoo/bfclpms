/**
 * ADR-218e — read-only fetch of everything behind an annual-review score:
 * the instance, its submitted responses (with reviewer names) and the
 * effective template. Used by `ReviewFormViewerDialog`.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type {
  AnnualReviewInstance,
  AnnualReviewTemplate,
} from '@/types/annualReview';
import type { ReviewFormResponseRow } from '@/lib/annualReview/reviewFormView';

export interface InstanceReviewForm {
  instance: AnnualReviewInstance;
  employeeName: string | null;
  employeeCode: string | null;
  template: AnnualReviewTemplate | null;
  responses: ReviewFormResponseRow[];
}

export function useInstanceReviewForm(instanceId: string | null | undefined) {
  return useQuery({
    queryKey: ['ar', 'review-form', instanceId],
    enabled: !!instanceId,
    staleTime: 30_000,
    queryFn: async (): Promise<InstanceReviewForm> => {
      const { data: inst, error: instErr } = await supabase
        .from('annual_review_instances')
        .select('*, employee:employee_id(full_name, employee_code)')
        .eq('id', instanceId as string)
        .maybeSingle();
      if (instErr) throw instErr;
      if (!inst) throw new Error('This review is not available for your access level.');

      const row = inst as unknown as AnnualReviewInstance & {
        employee?: { full_name?: string | null; employee_code?: string | null } | null;
      };
      const templateId = row.template_override_id ?? row.template_id;

      const [tplRes, respRes] = await Promise.all([
        templateId
          ? supabase.from('annual_review_templates').select('*').eq('id', templateId).maybeSingle()
          : Promise.resolve({ data: null, error: null } as const),
        supabase
          .from('annual_review_responses')
          .select('reviewer_role, criteria_scores, qualitative_responses, weighted_score, submitted_at, notes, reviewer:reviewer_id(full_name)')
          .eq('instance_id', instanceId as string),
      ]);
      if (tplRes.error) throw tplRes.error;
      if (respRes.error) throw respRes.error;

      const responses: ReviewFormResponseRow[] = (respRes.data ?? []).map((r: any) => ({
        reviewer_role: r.reviewer_role,
        criteria_scores: r.criteria_scores ?? {},
        qualitative_responses: r.qualitative_responses ?? {},
        weighted_score: r.weighted_score ?? null,
        submitted_at: r.submitted_at ?? null,
        notes: r.notes ?? null,
        reviewer_name: r.reviewer?.full_name ?? null,
      }));

      return {
        instance: row,
        employeeName: row.employee?.full_name ?? null,
        employeeCode: row.employee?.employee_code ?? null,
        template: (tplRes.data as AnnualReviewTemplate | null) ?? null,
        responses,
      };
    },
  });
}