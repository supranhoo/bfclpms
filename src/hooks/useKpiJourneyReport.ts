import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { differenceInDays } from 'date-fns';

export interface KpiJourneyRow {
  kpiId: string;
  employeeCode: string;
  employeeName: string;
  department: string;
  category: string;
  kraName: string;
  kpiName: string;
  reviewPeriod: string;
  status: string;
  kraAssignedAt: string | null;
  selfSubmittedAt: string | null;
  managerActionAt: string | null;
  skipLevelAt: string | null;
  hrPmsAt: string | null;
  auditorAt: string | null;
  managementAt: string | null;
  finalApprovedAt: string | null;
  totalDays: number;
  isCompliant: boolean;
  isOrgKpi: boolean;
  isNa: boolean;
}

const ACTION_MAP: Record<string, keyof Omit<KpiJourneyRow, 'kpiId' | 'employeeCode' | 'employeeName' | 'department' | 'category' | 'kraName' | 'kpiName' | 'reviewPeriod' | 'status' | 'totalDays' | 'isCompliant'>> = {
  'MANAGER_FORWARDED': 'managerActionAt',
  'MANAGER_SENT_BACK_TO_EMPLOYEE': 'managerActionAt',
  'SKIP_LEVEL_FORWARDED': 'skipLevelAt',
  'SKIP_LEVEL_SENT_BACK_TO_MANAGER': 'skipLevelAt',
  'SKIP_LEVEL_SENT_BACK_TO_EMPLOYEE': 'skipLevelAt',
  'HR_PMS_FORWARDED': 'hrPmsAt',
  'HR_PMS_SENT_BACK_TO_SKIP_LEVEL': 'hrPmsAt',
  'HR_PMS_SENT_BACK_TO_MANAGER': 'hrPmsAt',
  'HR_PMS_SENT_BACK_TO_EMPLOYEE': 'hrPmsAt',
  'AUDITOR_FORWARDED': 'auditorAt',
  'AUDITOR_SENT_BACK_TO_HR_PMS': 'auditorAt',
  'AUDITOR_SENT_BACK_TO_SKIP_LEVEL': 'auditorAt',
  'AUDITOR_SENT_BACK_TO_MANAGER': 'auditorAt',
  'AUDITOR_SENT_BACK_TO_EMPLOYEE': 'auditorAt',
  'MANAGEMENT_APPROVED': 'managementAt',
  'MANAGEMENT_SENT_BACK_TO_AUDITOR': 'managementAt',
  'MANAGEMENT_SENT_BACK_TO_HR_PMS': 'managementAt',
  'MANAGEMENT_SENT_BACK_TO_SKIP_LEVEL': 'managementAt',
  'MANAGEMENT_SENT_BACK_TO_MANAGER': 'managementAt',
  'MANAGEMENT_SENT_BACK_TO_EMPLOYEE': 'managementAt',
};

export function useKpiJourneyReport(selectedPeriod: string, selectedYear: string) {
  return useQuery({
    queryKey: ['kpi-journey-report', selectedYear, selectedPeriod],
    queryFn: async () => {
      const year = parseInt(selectedYear);

      // Batch fetch all KPIs for the period
      const allKpis: any[] = [];
      let offset = 0;
      const batchSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('kpis')
          .select(`
            id, employee_id, kra_name, kpi_name, status, created_at,
            review_period, review_year, is_org_level,
            kra_categories ( name )
          `)
          .eq('review_year', year)
          .eq('review_period', selectedPeriod)
          .range(offset, offset + batchSize - 1);

        if (error) throw error;
        if (data && data.length > 0) {
          allKpis.push(...data);
          offset += batchSize;
          hasMore = data.length === batchSize;
        } else {
          hasMore = false;
        }
      }

      if (allKpis.length === 0) return [];

      const kpiIds = allKpis.map(k => k.id);

      // Fetch profiles, submissions, and audit logs ALL in parallel
      const profilesPromise = supabase
        .from('profiles')
        .select('id, employee_code, full_name, department_id, departments ( name )');

      // Submissions: 1 row per KPI, fetch in single batched calls outside the loop
      const submissionsPromise = (async () => {
        const allSubs: any[] = [];
        for (let i = 0; i < kpiIds.length; i += 300) {
          const batch = kpiIds.slice(i, i + 300);
          const { data } = await supabase
            .from('review_submissions')
            .select('kpi_id, submitted_at, self_score, manager_score, skip_level_score, hr_pms_score, auditor_score, management_score, final_score, is_na')
            .in('kpi_id', batch);
          if (data) allSubs.push(...data);
        }
        return allSubs;
      })();

      // Audit logs: split into workflow actions (no new_value) and status transitions (with new_value)
      const logsPromise = (async () => {
        const allLogs: any[] = [];
        const batchSize = 300;
        for (let i = 0; i < kpiIds.length; i += batchSize) {
          const batch = kpiIds.slice(i, i + batchSize);
          const [workflowResult, transitionResult] = await Promise.all([
            supabase
              .from('kpi_audit_logs')
              .select('kpi_id, action, created_at')
              .in('kpi_id', batch)
              .neq('action', 'STATUS_TRANSITION')
              .order('created_at', { ascending: true }),
            supabase
              .from('kpi_audit_logs')
              .select('kpi_id, action, created_at, new_value')
              .in('kpi_id', batch)
              .eq('action', 'STATUS_TRANSITION')
              .order('created_at', { ascending: true }),
          ]);
          if (workflowResult.data) allLogs.push(...workflowResult.data);
          if (transitionResult.data) allLogs.push(...transitionResult.data);
        }
        return allLogs;
      })();

      const [profilesResult, allSubmissions, allLogs] = await Promise.all([
        profilesPromise, submissionsPromise, logsPromise,
      ]);

      const profileMap = new Map((profilesResult.data ?? []).map(p => [p.id, p]));

      // Build submissions map for fallback
      const submissionsMap = new Map<string, any>();
      for (const sub of allSubmissions) {
        submissionsMap.set(sub.kpi_id, sub);
      }

      // Build timeline map: kpiId → { field → earliest timestamp }
      const timelineMap = new Map<string, Record<string, string>>();

      for (const log of allLogs) {
        const existing = timelineMap.get(log.kpi_id) ?? {};

        // Handle STATUS_TRANSITION specially
        if (log.action === 'STATUS_TRANSITION') {
          const newValue = log.new_value as any;
          const newStatus = newValue?.status;
          if (newStatus === 'self_review' && !existing.selfSubmittedAt) {
            existing.selfSubmittedAt = log.created_at;
          } else if (newStatus === 'approved') {
            existing.finalApprovedAt = log.created_at;
          }
          timelineMap.set(log.kpi_id, existing);
          continue;
        }

        const field = ACTION_MAP[log.action];
        if (!field) continue;

        // Use the LATEST timestamp for each stage
        existing[field] = log.created_at;
        timelineMap.set(log.kpi_id, existing);
      }

      // Fallback: fill missing timeline fields from review_submissions
      for (const kpi of allKpis) {
        const timeline = timelineMap.get(kpi.id) ?? {};
        const sub = submissionsMap.get(kpi.id);
        if (!sub) continue;

        let changed = false;
        if (!timeline.selfSubmittedAt && (sub.self_score != null || sub.is_na)) {
          timeline.selfSubmittedAt = sub.submitted_at;
          changed = true;
        }
        if (!timeline.managerActionAt && sub.manager_score != null) {
          timeline.managerActionAt = sub.submitted_at;
          changed = true;
        }
        if (!timeline.skipLevelAt && sub.skip_level_score != null) {
          timeline.skipLevelAt = sub.submitted_at;
          changed = true;
        }
        if (!timeline.hrPmsAt && sub.hr_pms_score != null) {
          timeline.hrPmsAt = sub.submitted_at;
          changed = true;
        }
        if (!timeline.auditorAt && sub.auditor_score != null) {
          timeline.auditorAt = sub.submitted_at;
          changed = true;
        }
        if (!timeline.managementAt && sub.management_score != null) {
          timeline.managementAt = sub.submitted_at;
          changed = true;
        }
        if (!timeline.finalApprovedAt && kpi.status === 'approved' && sub.final_score != null) {
          timeline.finalApprovedAt = sub.submitted_at;
          changed = true;
        }
        if (changed) {
          timelineMap.set(kpi.id, timeline);
        }
      }

      const now = new Date();

      const rows: KpiJourneyRow[] = allKpis.map(kpi => {
        const profile = profileMap.get(kpi.employee_id);
        const timeline = timelineMap.get(kpi.id) ?? {};
        const deptData = profile?.departments as any;

        const kraDate = timeline.kraAssignedAt ?? kpi.created_at;
        const finalDate = timeline.finalApprovedAt;

        const totalDays = finalDate
          ? differenceInDays(new Date(finalDate), new Date(kraDate))
          : differenceInDays(now, new Date(kraDate));

        // Consider compliant if total days <= 30 (simple SLA check)
        const isCompliant = kpi.status === 'approved'
          ? totalDays <= 30
          : totalDays <= 45;

        return {
          kpiId: kpi.id,
          employeeCode: profile?.employee_code ?? '—',
          employeeName: profile?.full_name ?? 'Unknown',
          department: deptData?.name ?? '—',
          category: (kpi.kra_categories as any)?.name ?? '—',
          kraName: kpi.kra_name ?? '—',
          kpiName: kpi.kpi_name ?? '—',
          reviewPeriod: kpi.review_period ?? '—',
          status: kpi.status ?? 'kra_set',
          kraAssignedAt: timeline.kraAssignedAt ?? kpi.created_at ?? null,
          selfSubmittedAt: timeline.selfSubmittedAt ?? null,
          managerActionAt: timeline.managerActionAt ?? null,
          skipLevelAt: timeline.skipLevelAt ?? null,
          hrPmsAt: timeline.hrPmsAt ?? null,
          auditorAt: timeline.auditorAt ?? null,
          managementAt: timeline.managementAt ?? null,
          finalApprovedAt: timeline.finalApprovedAt ?? null,
          totalDays,
          isCompliant,
          isOrgKpi: !!kpi.is_org_level,
          isNa: submissionsMap.get(kpi.id)?.is_na === true,
        };
      });

      rows.sort((a, b) =>
        a.employeeName.localeCompare(b.employeeName) ||
        a.kraName.localeCompare(b.kraName) ||
        a.kpiName.localeCompare(b.kpiName)
      );

      return rows;
    },
    enabled: !!selectedPeriod && !!selectedYear,
  });
}
