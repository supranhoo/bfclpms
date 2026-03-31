import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { resolveForwardStatus, resolveReviewableStatuses, DEFAULT_WORKFLOW_STAGES } from '@/lib/workflowEngine';

export interface OrgKpiAuditEmployee {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  departmentName: string;
  designationName: string;
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
  criteria: string | null;
  targetValue: number | null;
  uom: string | null;
  achievedValue: number | null;
  dataEntryRemarks: string | null;
  evidenceUrl: string | null;
  evidenceUrls: any[] | null;
  enteredByName: string | null;
  dataSource: string | null;
  orgValueStatus: string | null;
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
          target_value, uom, is_org_level, criteria,
          kra_categories (id, name, color)
        `)
        .eq('is_org_level', true)
        .eq('review_period', reviewPeriod)
        .eq('review_year', reviewYear);

      if (kpiErr) throw kpiErr;
      if (!orgKpis?.length) return { groups: [] as OrgKpiAuditGroup[], totalPending: 0, totalAudited: 0 };

      // 2. Get all employee IDs
      const employeeIds = [...new Set(orgKpis.map(k => k.employee_id))];

      // 3. Batch fetch profiles with department and designation joins
      const profiles: Array<any> = [];
      for (let i = 0; i < employeeIds.length; i += 500) {
        const batch = employeeIds.slice(i, i + 500);
        const { data } = await supabase
          .from('profiles')
          .select('id, full_name, employee_code, department_id, designation_id')
          .in('id', batch) as any;
        if (data) profiles.push(...data);
      }
      const profileMap = new Map(profiles.map((p: any) => [p.id, p]));

      // Fetch departments and designations for mapping
      const deptIds = [...new Set(profiles.map(p => (p as any).department_id).filter(Boolean))];
      const desigIds = [...new Set(profiles.map(p => (p as any).designation_id).filter(Boolean))];
      
      const deptMap = new Map<string, string>();
      const desigMap = new Map<string, string>();
      
      if (deptIds.length > 0) {
        const { data: depts } = await supabase.from('departments').select('id, name').in('id', deptIds);
        depts?.forEach(d => deptMap.set(d.id, d.name));
      }
      if (desigIds.length > 0) {
        const { data: desigs } = await supabase.from('designations').select('id, name').in('id', desigIds);
        desigs?.forEach(d => desigMap.set(d.id, d.name));
      }

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

      // 6. Fetch org KPI achieved values with data entry details
      const { data: orgValues } = await supabase
        .from('org_kpi_values')
        .select('category_id, kra_name, kpi_name, achieved_value, remarks, evidence_url, evidence_urls, entered_by, data_source, status, entered_by_profile:profiles!org_kpi_values_entered_by_fkey(full_name)')
        .eq('review_period', reviewPeriod)
        .eq('review_year', reviewYear);

      const orgValueMap = new Map<string, any>();
      orgValues?.forEach(v => {
        orgValueMap.set(`${v.category_id}||${v.kra_name}||${v.kpi_name}`, v);
      });

      // 7. Group KPIs by org KPI definition and filter for audit-stage
      const groupMap = new Map<string, OrgKpiAuditGroup>();

      for (const kpi of orgKpis) {
        const empStages = workflowMap.get(kpi.employee_id) || DEFAULT_WORKFLOW_STAGES;

        if (!empStages.includes('audit')) continue;

        const reviewableStatuses = resolveReviewableStatuses('auditor', empStages);
        const isAuditPending = reviewableStatuses.includes(kpi.status as string);

        const auditIdx = empStages.indexOf('audit');
        const statusIdx = empStages.indexOf(kpi.status as string);
        const isAudited = statusIdx > auditIdx;

        if (!isAuditPending && !isAudited) continue;

        const key = `${kpi.category_id}||${kpi.kra_name}||${kpi.kpi_name}`;
        const cat = kpi.kra_categories as any;
        const profile = profileMap.get(kpi.employee_id);
        const submission = submissionMap.get(kpi.id);

        const employee: OrgKpiAuditEmployee = {
          employeeId: kpi.employee_id,
          employeeName: profile?.full_name || 'Unknown',
          employeeCode: profile?.employee_code || '',
          departmentName: deptMap.get((profile as any)?.department_id) || 'Unassigned',
          designationName: desigMap.get((profile as any)?.designation_id) || '',
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
          const orgVal = orgValueMap.get(key);
          groupMap.set(key, {
            categoryId: kpi.category_id,
            categoryName: cat?.name || 'Unknown',
            categoryColor: cat?.color || '#6B7280',
            kraName: kpi.kra_name,
            kpiName: kpi.kpi_name,
            criteria: (kpi as any).criteria || null,
            targetValue: kpi.target_value,
            uom: kpi.uom,
            achievedValue: orgVal?.achieved_value ?? null,
            dataEntryRemarks: orgVal?.remarks ?? null,
            evidenceUrl: orgVal?.evidence_url ?? null,
            evidenceUrls: Array.isArray(orgVal?.evidence_urls) ? orgVal.evidence_urls : null,
            enteredByName: (orgVal?.entered_by_profile as any)?.full_name ?? null,
            dataSource: orgVal?.data_source ?? null,
            orgValueStatus: orgVal?.status ?? null,
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
      const auditorRating = auditorScore >= 5 ? 'blue' : auditorScore >= 4 ? 'green' : auditorScore >= 3 ? 'yellow' : 'red';

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

      const newStatus = approve ? resolveForwardStatus('auditor', workflowStages) : 'audit';
      if (!newStatus) throw new Error('Cannot resolve next workflow status.');

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
