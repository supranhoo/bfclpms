import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ComplianceSubFactors {
  policy_compliance: boolean | null;
  submission_date: string | null;
  submission_complete: boolean;
  submission_pending_count: number;
  policy_training: boolean | null;
  other_observation: number | null;
}

/**
 * Detects if a KPI is the compliance KPI based on KRA name.
 */
export function isComplianceKpi(kraName: string | null | undefined): boolean {
  if (!kraName) return false;
  return kraName.toLowerCase().includes('implementation of common');
}

/**
 * Auto-fetch submission completion date for an employee in a given period.
 * Scans all non-org, non-sent-back, non-not-due KPIs.
 * Returns the latest submission date if all eligible KPIs are past self_review,
 * or the count of pending KPIs.
 */
export function useEmployeeSubmissionDate(
  employeeId: string | undefined,
  reviewPeriod: string | undefined,
  reviewYear: number | undefined,
  enabled = true
) {
  return useQuery({
    queryKey: ['compliance-submission-date', employeeId, reviewPeriod, reviewYear],
    queryFn: async () => {
      if (!employeeId || !reviewPeriod || !reviewYear) return null;

      // Get all non-org KPIs for this employee/period
      const { data: kpis, error: kErr } = await supabase
        .from('kpis')
        .select('id, status, frequency, is_org_level, kra_name')
        .eq('employee_id', employeeId)
        .eq('review_period', reviewPeriod)
        .eq('review_year', reviewYear);

      if (kErr) throw kErr;
      if (!kpis || kpis.length === 0) return { complete: true, date: null, pendingCount: 0 };

      // Filter: exclude org-level KPIs
      let eligible = kpis.filter(k => !k.is_org_level);

      // Exclude sent-back KPIs (status = kra_set with a send_back query)
      const kpiIds = eligible.map(k => k.id);
      if (kpiIds.length > 0) {
        const { data: queries } = await supabase
          .from('kpi_queries')
          .select('kpi_id')
          .in('kpi_id', kpiIds)
          .eq('query_type', 'send_back');

        const sentBackIds = new Set((queries || []).map(q => q.kpi_id));
        eligible = eligible.filter(k => {
          if (k.status === 'kra_set' && sentBackIds.has(k.id)) return false;
          return true;
        });
      }

      // Exclude frequency-based KPIs that are not due yet
      // Monthly KPIs are always due. Others check review_period against frequency cycle
      eligible = eligible.filter(k => {
        if (!k.frequency) return true;
        const freq = k.frequency.toLowerCase();
        if (freq === 'monthly' || freq === 'daily' || freq === 'weekly') return true;
        // For quarterly, bi-monthly, half-yearly, yearly — they're only "due" 
        // if the current period is the terminal month of their cycle.
        // Since we can't easily determine this without frequency_config,
        // we include all KPIs at kra_set status (they should have been submitted)
        // and exclude those at statuses beyond self_review (already done)
        return true;
      });

      if (eligible.length === 0) return { complete: true, date: null, pendingCount: 0 };

      // Check which are still at kra_set (not submitted)
      const pending = eligible.filter(k => k.status === 'kra_set');
      if (pending.length > 0) {
        return { complete: false, date: null, pendingCount: pending.length };
      }

      // All eligible KPIs are past kra_set — find the latest submission date
      const eligibleIds = eligible.map(k => k.id);
      const { data: subs } = await supabase
        .from('review_submissions')
        .select('submitted_at')
        .in('kpi_id', eligibleIds)
        .order('submitted_at', { ascending: false })
        .limit(1);

      const latestDate = subs?.[0]?.submitted_at || null;
      return { complete: true, date: latestDate, pendingCount: 0 };
    },
    enabled: enabled && !!employeeId && !!reviewPeriod && !!reviewYear,
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Batch fetch submission dates for multiple employees.
 */
export function useBulkEmployeeSubmissionDates(
  employeeIds: string[],
  reviewPeriod: string | undefined,
  reviewYear: number | undefined,
  enabled = true
) {
  return useQuery({
    queryKey: ['compliance-bulk-submission-dates', employeeIds.sort().join(','), reviewPeriod, reviewYear],
    queryFn: async () => {
      if (!reviewPeriod || !reviewYear || employeeIds.length === 0) return new Map<string, { complete: boolean; date: string | null; pendingCount: number }>();

      // Get all non-org KPIs for these employees/period
      const { data: kpis, error: kErr } = await supabase
        .from('kpis')
        .select('id, employee_id, status, frequency, is_org_level')
        .in('employee_id', employeeIds)
        .eq('review_period', reviewPeriod)
        .eq('review_year', reviewYear);

      if (kErr) throw kErr;

      // Filter out org-level
      const eligible = (kpis || []).filter(k => !k.is_org_level);

      // Get sent-back KPIs
      const allKpiIds = eligible.map(k => k.id);
      let sentBackIds = new Set<string>();
      if (allKpiIds.length > 0) {
        // Batch in chunks of 500
        for (let i = 0; i < allKpiIds.length; i += 500) {
          const chunk = allKpiIds.slice(i, i + 500);
          const { data: queries } = await supabase
            .from('kpi_queries')
            .select('kpi_id')
            .in('kpi_id', chunk)
            .eq('query_type', 'send_back');
          (queries || []).forEach(q => sentBackIds.add(q.kpi_id));
        }
      }

      // Group by employee
      const result = new Map<string, { complete: boolean; date: string | null; pendingCount: number }>();

      const byEmployee = new Map<string, typeof eligible>();
      for (const k of eligible) {
        if (k.status === 'kra_set' && sentBackIds.has(k.id)) continue;
        const list = byEmployee.get(k.employee_id) || [];
        list.push(k);
        byEmployee.set(k.employee_id, list);
      }

      // Get submissions for all eligible KPIs
      const eligibleIds = eligible.filter(k => !(k.status === 'kra_set' && sentBackIds.has(k.id))).map(k => k.id);
      const subMap = new Map<string, string>();
      if (eligibleIds.length > 0) {
        for (let i = 0; i < eligibleIds.length; i += 500) {
          const chunk = eligibleIds.slice(i, i + 500);
          const { data: subs } = await supabase
            .from('review_submissions')
            .select('kpi_id, submitted_at')
            .in('kpi_id', chunk);
          (subs || []).forEach(s => {
            const existing = subMap.get(s.kpi_id);
            if (!existing || s.submitted_at > existing) {
              subMap.set(s.kpi_id, s.submitted_at);
            }
          });
        }
      }

      for (const empId of employeeIds) {
        const empKpis = byEmployee.get(empId) || [];
        if (empKpis.length === 0) {
          result.set(empId, { complete: true, date: null, pendingCount: 0 });
          continue;
        }

        const pending = empKpis.filter(k => k.status === 'kra_set');
        if (pending.length > 0) {
          result.set(empId, { complete: false, date: null, pendingCount: pending.length });
          continue;
        }

        // Find latest submission date
        let latestDate: string | null = null;
        for (const k of empKpis) {
          const d = subMap.get(k.id);
          if (d && (!latestDate || d > latestDate)) latestDate = d;
        }
        result.set(empId, { complete: true, date: latestDate, pendingCount: 0 });
      }

      return result;
    },
    enabled: enabled && !!reviewPeriod && !!reviewYear && employeeIds.length > 0,
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Fetch sub_factors from org_kpi_values for a specific employee/KPI/period.
 * Used in the review journey to show compliance factors.
 */
export function useComplianceSubFactors(
  employeeId: string | undefined,
  categoryId: string | undefined,
  kraName: string | undefined,
  kpiName: string | undefined,
  reviewPeriod: string | undefined,
  reviewYear: number | undefined
) {
  return useQuery({
    queryKey: ['compliance-sub-factors', employeeId, categoryId, kraName, kpiName, reviewPeriod, reviewYear],
    queryFn: async () => {
      if (!employeeId || !categoryId || !kraName || !kpiName || !reviewPeriod || !reviewYear) return null;

      const { data, error } = await supabase
        .from('org_kpi_values')
        .select('sub_factors, achieved_value')
        .eq('category_id', categoryId)
        .eq('kra_name', kraName)
        .eq('kpi_name', kpiName)
        .eq('review_period', reviewPeriod)
        .eq('review_year', reviewYear)
        .eq('employee_id', employeeId)
        .maybeSingle();

      if (error) throw error;
      if (!data || !data.sub_factors) return null;

      return {
        subFactors: data.sub_factors as unknown as ComplianceSubFactors,
        achievedValue: data.achieved_value as number | null,
      };
    },
    enabled: !!employeeId && !!categoryId && !!kraName && !!kpiName && !!reviewPeriod && !!reviewYear,
    staleTime: 2 * 60 * 1000,
  });
}
