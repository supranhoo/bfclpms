import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SendBackEntry {
  date: string;
  raisedBy: string;
  reason: string;
}

export interface KpiJourneyRow {
  kpiId: string;
  employeeCode: string;
  employeeName: string;
  department: string;
  reportingManager: string;
  category: string;
  kraName: string;
  kpiName: string;
  frequency: string;
  workflowChain: string;
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
  sendBackCount: number;
  sendBacks: SendBackEntry[];
}

export interface KpiJourneyFilters {
  department?: string;
  status?: string;
  type?: string;
  search?: string;
}

export interface KpiJourneySummary {
  total: number;
  pending: number;
  avgToSelf: number;
  avgToFinal: number;
  totalSendBacks: number;
}

export interface KpiJourneyResult {
  rows: KpiJourneyRow[];
  totalCount: number;
  summary: KpiJourneySummary;
}

const PAGE_SIZE = 50;

export function useKpiJourneyReport(
  selectedPeriod: string,
  selectedYear: string,
  currentPage: number,
  filters: KpiJourneyFilters
) {
  return useQuery<KpiJourneyResult>({
    queryKey: ['kpi-journey-report', selectedYear, selectedPeriod, currentPage, filters],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_kpi_journey_report', {
        p_period: selectedPeriod,
        p_year: parseInt(selectedYear),
        p_department: filters.department === 'all' ? null : (filters.department || null),
        p_status: filters.status === 'all' ? null : (filters.status || null),
        p_type: filters.type === 'all' ? null : (filters.type || null),
        p_search: filters.search || null,
        p_limit: PAGE_SIZE,
        p_offset: (currentPage - 1) * PAGE_SIZE,
      });

      if (error) throw error;

      const result = data as unknown as KpiJourneyResult;
      return {
        rows: result.rows ?? [],
        totalCount: result.totalCount ?? 0,
        summary: result.summary ?? { total: 0, pending: 0, avgToSelf: 0, avgToFinal: 0, totalSendBacks: 0 },
      };
    },
    enabled: !!selectedPeriod && !!selectedYear,
    placeholderData: (prev) => prev,
  });
}

/** Fetch ALL filtered rows for export (no pagination) */
export async function fetchKpiJourneyExportData(
  selectedPeriod: string,
  selectedYear: string,
  filters: KpiJourneyFilters
): Promise<KpiJourneyRow[]> {
  const allRows: KpiJourneyRow[] = [];
  let offset = 0;
  const batchSize = 500;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase.rpc('get_kpi_journey_report', {
      p_period: selectedPeriod,
      p_year: parseInt(selectedYear),
      p_department: filters.department === 'all' ? null : (filters.department || null),
      p_status: filters.status === 'all' ? null : (filters.status || null),
      p_type: filters.type === 'all' ? null : (filters.type || null),
      p_search: filters.search || null,
      p_limit: batchSize,
      p_offset: offset,
    });

    if (error) throw error;
    const result = data as unknown as KpiJourneyResult;
    const rows = result.rows ?? [];
    allRows.push(...rows);
    offset += batchSize;
    hasMore = rows.length === batchSize;
  }

  return allRows;
}
