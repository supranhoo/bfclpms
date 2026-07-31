import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ChangeHistoryRow } from '@/lib/reports/changeHistory';

export const CHANGE_HISTORY_PAGE_SIZE = 50;
/** Hard cap for the Excel export (POLICY §RPT-LARGE-EXPORT). */
export const CHANGE_HISTORY_EXPORT_CAP = 5000;

export interface ChangeHistoryFilters {
  from?: string | null;
  to?: string | null;
  categories?: string[];
  search?: string;
  changedBy?: string | null;
  departmentId?: string | null;
}

function rpcArgs(f: ChangeHistoryFilters, limit: number, offset: number) {
  return {
    p_from: f.from || null,
    p_to: f.to || null,
    p_categories: f.categories && f.categories.length > 0 ? f.categories : null,
    p_search: f.search?.trim() || null,
    p_changed_by: f.changedBy || null,
    p_department: f.departmentId || null,
    p_limit: limit,
    p_offset: offset,
  };
}

export function useChangeHistory(filters: ChangeHistoryFilters, page: number) {
  return useQuery({
    queryKey: ['change-history', filters, page],
    queryFn: async () => {
      const offset = (page - 1) * CHANGE_HISTORY_PAGE_SIZE;
      const { data, error } = await supabase.rpc(
        'get_change_history' as never,
        rpcArgs(filters, CHANGE_HISTORY_PAGE_SIZE, offset) as never,
      );
      if (error) throw error;
      const rows = (data ?? []) as unknown as ChangeHistoryRow[];
      return { rows, total: rows[0]?.total_count ?? 0 };
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

/** Server-paginated fetch used by the Excel export. Capped and page-wise. */
export async function fetchChangeHistoryForExport(
  filters: ChangeHistoryFilters,
): Promise<{ rows: ChangeHistoryRow[]; truncated: boolean }> {
  const pageSize = 500;
  const out: ChangeHistoryRow[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase.rpc(
      'get_change_history' as never,
      rpcArgs(filters, pageSize, offset) as never,
    );
    if (error) throw error;
    const batch = (data ?? []) as unknown as ChangeHistoryRow[];
    out.push(...batch);
    if (batch.length < pageSize || out.length >= CHANGE_HISTORY_EXPORT_CAP) break;
    offset += pageSize;
  }
  const truncated = out.length > CHANGE_HISTORY_EXPORT_CAP;
  return { rows: out.slice(0, CHANGE_HISTORY_EXPORT_CAP), truncated };
}
