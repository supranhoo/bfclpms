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
            review_period, review_year,
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

      // Fetch profiles
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, employee_code, full_name, department_id, departments ( name )');

      const profileMap = new Map((profiles ?? []).map(p => [p.id, p]));

      // Fetch audit logs for all KPI IDs in batches
      const kpiIds = allKpis.map(k => k.id);
      const allLogs: any[] = [];
      const logBatchSize = 500;

      for (let i = 0; i < kpiIds.length; i += logBatchSize) {
        const batch = kpiIds.slice(i, i + logBatchSize);
        const { data: logs } = await supabase
          .from('kpi_audit_logs')
          .select('kpi_id, action, created_at')
          .in('kpi_id', batch)
          .order('created_at', { ascending: true });

        if (logs) allLogs.push(...logs);
      }

      // Build timeline map: kpiId → { field → earliest timestamp }
      const timelineMap = new Map<string, Record<string, string>>();

      for (const log of allLogs) {
        const field = ACTION_MAP[log.action];
        if (!field) {
          // Also handle generic STATUS_CHANGE_TO_* actions
          if (log.action.startsWith('STATUS_CHANGE_TO_approved')) {
            const existing = timelineMap.get(log.kpi_id) ?? {};
            if (!existing.finalApprovedAt) {
              existing.finalApprovedAt = log.created_at;
              timelineMap.set(log.kpi_id, existing);
            }
          }
          continue;
        }

        const existing = timelineMap.get(log.kpi_id) ?? {};
        // Use the LATEST timestamp for each stage (most recent action)
        existing[field] = log.created_at;
        timelineMap.set(log.kpi_id, existing);
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
