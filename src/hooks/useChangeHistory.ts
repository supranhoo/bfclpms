import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ChangeHistoryRow } from '@/lib/reports/changeHistory';

export const CHANGE_HISTORY_PAGE_SIZE = 50;
/**
 * Runaway guard for the Excel export (ADR-215). This is NOT a business cap:
 * the export pages until the server returns a short page. 100k is the point
 * where a single sheet / the browser stops being comfortable.
 */
export const CHANGE_HISTORY_EXPORT_CAP = 100_000;
/** Rows fetched per server round trip during an export. */
export const CHANGE_HISTORY_EXPORT_BATCH = 500;

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

/**
 * Server-paginated fetch used by the Excel export.
 *
 * Runs until the server returns a short page, so the file matches the filtered
 * record count exactly. `truncated` is only true if the runaway guard fires.
 */
export async function fetchChangeHistoryForExport(
  filters: ChangeHistoryFilters,
  onProgress?: (fetched: number, total: number) => void,
): Promise<{ rows: ChangeHistoryRow[]; truncated: boolean; total: number }> {
  const out: ChangeHistoryRow[] = [];
  let offset = 0;
  let total = 0;
  for (;;) {
    const { data, error } = await supabase.rpc(
      'get_change_history' as never,
      rpcArgs(filters, CHANGE_HISTORY_EXPORT_BATCH, offset) as never,
    );
    if (error) throw error;
    const batch = (data ?? []) as unknown as ChangeHistoryRow[];
    out.push(...batch);
    total = batch[0]?.total_count ?? total ?? 0;
    onProgress?.(out.length, Math.max(total, out.length));
    if (batch.length < CHANGE_HISTORY_EXPORT_BATCH) break;
    if (out.length >= CHANGE_HISTORY_EXPORT_CAP) break;
    offset += CHANGE_HISTORY_EXPORT_BATCH;
  }
  const truncated = out.length >= CHANGE_HISTORY_EXPORT_CAP && out.length < total;
  return { rows: out.slice(0, CHANGE_HISTORY_EXPORT_CAP), truncated, total: Math.max(total, out.length) };
}
