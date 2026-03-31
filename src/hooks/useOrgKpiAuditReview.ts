import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { resolveForwardStatus, resolveReviewableStatuses, DEFAULT_WORKFLOW_STAGES } from '@/lib/workflowEngine';

export interface OrgKpiAuditEmployee {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  kpiId: string;
  kpiStatus: string;
  selfScore: number | null;
  managerScore: number | null;
  auditorScore: number | null;
  auditorRemarks: string | null;
  finalScore: number | null;
  workflowStages: string[];
  isAuditPending: boolean;
  isAudited: boolean;
}

export interface OrgKpiAuditGroup {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  kraName: string;
  kpiName: string;
  targetValue: number | null;
  uom: string | null;
  achievedValue: number | null;
  employees: OrgKpiAuditEmployee[];
  pendingCount: number;
  auditedCount: number;
  totalCount: number;
}

export function useOrgKpiAuditReview(reviewPeriod: string, reviewYear: number) {
  return useQuery({
    queryKey: ['org-kpi-audit-review', reviewPeriod, reviewYear],
    queryFn: async () => {
      // 1. Fetch all org-level KPIs for this period
      const { data: orgKpis, error: kpiErr } = await supabase
        .from('kpis')
        .select(`
          id, employee_id, category_id, kra_name, kpi_name, status,
          target_value, uom, is_org_level,
          kra_categories (id, name, color)
        `)
        .eq('is_org_level', true)
        .eq('review_period', reviewPeriod)
        .eq('review_year', reviewYear);

      if (kpiErr) throw kpiErr;
      if (!orgKpis?.length) return { groups: [] as OrgKpiAuditGroup[], totalPending: 0, totalAudited: 0 };

      // 2. Get all employee IDs
      const employeeIds = [...new Set(orgKpis.map(k => k.employee_id))];

      // 3. Batch fetch profiles
      const profiles: Array<{ id: string; full_name: string | null; employee_code: string | null }> = [];
      for (let i = 0; i < employeeIds.length; i += 500) {
        const batch = employeeIds.slice(i, i + 500);
        const { data } = await supabase.from('profiles').select('id, full_name, employee_code').in('id', batch);
        if (data) profiles.push(...data);
      }
      const profileMap = new Map(profiles.map(p => [p.id, p]));

      // 4. Fetch review submissions for all these KPIs
      const kpiIds = orgKpis.map(k => k.id);
      const submissions: Array<any> = [];
      for (let i = 0; i < kpiIds.length; i += 500) {
        const batch = kpiIds.slice(i, i + 500);
        const { data } = await supabase.from('review_submissions')
          .select('kpi_id, self_score, manager_score, auditor_score, auditor_remarks, final_score')
          .in('kpi_id', batch);
        if (data) submissions.push(...data);
      }
      const submissionMap = new Map(submissions.map(s => [s.kpi_id, s]));

      // 5. Batch fetch workflows for all employees
      const workflowMap = new Map<string, string[]>();
      for (const empId of employeeIds) {
        const { data: wf } = await supabase.rpc('get_employee_workflow_info', {
          employee_uuid: empId,
          p_review_period: reviewPeriod,
          p_review_year: reviewYear,
        });
        if (wf?.[0]?.stages) {
          const stages = typeof wf[0].stages === 'string' ? JSON.parse(wf[0].stages) : wf[0].stages;
          workflowMap.set(empId, stages);
        }
      }

      // 6. Fetch org KPI achieved values
      const { data: orgValues } = await supabase
        .from('org_kpi_values')
        .select('category_id, kra_name, kpi_name, achieved_value')
        .eq('review_period', reviewPeriod)
        .eq('review_year', reviewYear);

      const achievedMap = new Map<string, number | null>();
      orgValues?.forEach(v => {
        achievedMap.set(`${v.category_id}||${v.kra_name}||${v.kpi_name}`, v.achieved_value);
      });

      // 7. Group KPIs by org KPI definition and filter for audit-stage
      const groupMap = new Map<string, OrgKpiAuditGroup>();

      for (const kpi of orgKpis) {
        const empStages = workflowMap.get(kpi.employee_id) || DEFAULT_WORKFLOW_STAGES;

        // Check if this workflow has an audit stage
        if (!empStages.includes('audit')) continue;

        // Get auditor-reviewable statuses
        const reviewableStatuses = resolveReviewableStatuses('auditor', empStages);
        const isAuditPending = reviewableStatuses.includes(kpi.status as string);

        // Check if audited (status is past audit stage)
        const auditIdx = empStages.indexOf('audit');
        const statusIdx = empStages.indexOf(kpi.status as string);
        const isAudited = statusIdx > auditIdx;

        // Only include if at or past audit stage
        if (!isAuditPending && !isAudited) continue;

        const key = `${kpi.category_id}||${kpi.kra_name}||${kpi.kpi_name}`;
        const cat = kpi.kra_categories as any;
        const profile = profileMap.get(kpi.employee_id);
        const submission = submissionMap.get(kpi.id);

        const employee: OrgKpiAuditEmployee = {
          employeeId: kpi.employee_id,
          employeeName: profile?.full_name || 'Unknown',
          employeeCode: profile?.employee_code || '',
          kpiId: kpi.id,
          kpiStatus: kpi.status as string,
          selfScore: submission?.self_score ?? null,
          managerScore: submission?.manager_score ?? null,
          auditorScore: submission?.auditor_score ?? null,
          auditorRemarks: submission?.auditor_remarks ?? null,
          finalScore: submission?.final_score ?? null,
          workflowStages: empStages,
          isAuditPending,
          isAudited,
        };

        if (!groupMap.has(key)) {
          groupMap.set(key, {
            categoryId: kpi.category_id,
            categoryName: cat?.name || 'Unknown',
            categoryColor: cat?.color || '#6B7280',
            kraName: kpi.kra_name,
            kpiName: kpi.kpi_name,
            targetValue: kpi.target_value,
            uom: kpi.uom,
            achievedValue: achievedMap.get(key) ?? null,
            employees: [],
            pendingCount: 0,
            auditedCount: 0,
            totalCount: 0,
          });
        }

        const group = groupMap.get(key)!;
        group.employees.push(employee);
        group.totalCount++;
        if (isAuditPending) group.pendingCount++;
        if (isAudited) group.auditedCount++;
      }

      const groups = Array.from(groupMap.values()).sort((a, b) =>
        a.categoryName.localeCompare(b.categoryName) || a.kraName.localeCompare(b.kraName)
      );

      const totalPending = groups.reduce((sum, g) => sum + g.pendingCount, 0);
      const totalAudited = groups.reduce((sum, g) => sum + g.auditedCount, 0);

      return { groups, totalPending, totalAudited };
    },
    enabled: !!reviewPeriod && !!reviewYear,
  });
}

export function useSubmitOrgKpiAuditScore() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      kpiId,
      auditorScore,
      auditorRemarks,
      approve,
      workflowStages,
    }: {
      kpiId: string;
      auditorScore: number;
      auditorRemarks: string;
      approve: boolean;
      workflowStages: string[];
    }) => {
      // Compute rating
      const auditorRating = auditorScore >= 5 ? 'blue' : auditorScore >= 4 ? 'green' : auditorScore >= 3 ? 'yellow' : 'red';

      // Update review_submissions
      const { data: updateData, error: subErr } = await supabase
        .from('review_submissions')
        .update({
          auditor_score: auditorScore,
          auditor_rating: auditorRating as any,
          auditor_remarks: auditorRemarks,
        })
        .eq('kpi_id', kpiId)
        .select();

      if (subErr) throw subErr;
      if (!updateData?.length) throw new Error('Unable to update submission. Permission denied.');

      // Advance status
      const newStatus = approve ? resolveForwardStatus('auditor', workflowStages) : 'audit';
      if (!newStatus) throw new Error('Cannot resolve next workflow status.');

      // If approving to final 'approved', sync final_score
      const updatePayload: any = { status: newStatus };
      if (newStatus === 'approved') {
        await supabase.from('review_submissions')
          .update({ final_score: auditorScore, final_rating: auditorRating as any })
          .eq('kpi_id', kpiId);
      }

      const { data: kpiData, error: kpiErr } = await supabase
        .from('kpis')
        .update({ status: newStatus as any })
        .eq('id', kpiId)
        .select();

      if (kpiErr) throw kpiErr;
      if (!kpiData?.length) throw new Error('Unable to update KPI status.');

      // Audit log
      if (user?.id) {
        await supabase.from('kpi_audit_logs').insert({
          kpi_id: kpiId,
          action: approve ? 'ORG_KPI_AUDIT_APPROVED' : 'ORG_KPI_AUDIT_REVIEWED',
          performed_by: user.id,
          new_value: { auditor_score: auditorScore, auditor_remarks: auditorRemarks } as any,
          metadata: { source: 'org_kpi_audit_review', forwarded: approve } as any,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-kpi-audit-review'] });
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['review-submissions'] });
    },
    onError: (err: Error) => {
      toast({ title: 'Failed to submit audit score', description: err.message, variant: 'destructive' });
    },
  });
}
