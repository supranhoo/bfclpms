import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type DevReportEntryType = 'feature' | 'bug' | 'timeline';

export interface DevReportEntry {
  id: string;
  entry_type: DevReportEntryType;
  entry_date: string | null;
  period_label: string | null;
  title: string;
  module_area: string | null;
  description: string;
  status: string | null;
  severity: string | null;
  timeline_type: string | null;
  adr_refs: string[];
  linked_commit: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type DevReportEntryInput = Omit<
  DevReportEntry,
  'id' | 'created_at' | 'updated_at' | 'created_by'
>;

export interface DevReportSummary {
  feature_count: number;
  bug_count: number;
  timeline_count: number;
  min_entry_date: string | null;
  max_entry_date: string | null;
}

const TABLE = 'dev_report_entries' as const;
const KEY = ['dev-report-entries'] as const;

/**
 * Convert a `YYYY-MM` token into inclusive/exclusive ISO bounds for the month.
 * Exported for unit testing.
 */
export function monthBounds(month?: string | null): { from: string; toExclusive: string } | null {
  if (!month) return null;
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  const from = `${m[1]}-${m[2]}-01`;
  const nextY = mo === 12 ? y + 1 : y;
  const nextM = mo === 12 ? 1 : mo + 1;
  const toExclusive = `${nextY.toString().padStart(4, '0')}-${nextM
    .toString()
    .padStart(2, '0')}-01`;
  return { from, toExclusive };
}

export interface DevReportEntriesFilter {
  entryType?: DevReportEntryType;
  /** YYYY-MM, filters server-side by entry_date within that month. */
  month?: string | null;
}

export function useDevReportEntries(filter: DevReportEntriesFilter = {}) {
  const { entryType, month } = filter;
  const bounds = monthBounds(month);
  return useQuery({
    queryKey: [...KEY, entryType ?? 'all', month ?? 'all'],
    queryFn: async (): Promise<DevReportEntry[]> => {
      let q = supabase
        .from(TABLE as any)
        .select('*')
        .order('entry_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });
      if (entryType) q = q.eq('entry_type', entryType);
      if (bounds) {
        q = q.gte('entry_date', bounds.from).lt('entry_date', bounds.toExclusive);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as DevReportEntry[];
    },
    staleTime: 60 * 1000,
  });
}

/** Distinct YYYY-MM months that have at least one entry, DESC. */
export function useDevReportMonths() {
  return useQuery({
    queryKey: [...KEY, 'months'],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from(TABLE as any)
        .select('entry_date')
        .not('entry_date', 'is', null)
        .order('entry_date', { ascending: false })
        .limit(5000);
      if (error) throw error;
      const seen = new Set<string>();
      const rows = (data ?? []) as unknown as Array<{ entry_date: string | null }>;
      for (const row of rows) {
        if (!row.entry_date) continue;
        seen.add(row.entry_date.slice(0, 7));
      }
      return Array.from(seen);
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useDevReportSummary(periodFrom?: string, periodTo?: string) {
  return useQuery({
    queryKey: [...KEY, 'summary', periodFrom ?? null, periodTo ?? null],
    queryFn: async (): Promise<DevReportSummary> => {
      const { data, error } = await supabase.rpc('dev_report_summary' as any, {
        period_from: periodFrom ?? null,
        period_to: periodTo ?? null,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return {
        feature_count: Number(row?.feature_count ?? 0),
        bug_count: Number(row?.bug_count ?? 0),
        timeline_count: Number(row?.timeline_count ?? 0),
        min_entry_date: row?.min_entry_date ?? null,
        max_entry_date: row?.max_entry_date ?? null,
      };
    },
    staleTime: 60 * 1000,
  });
}

export function useUpsertDevReportEntry() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: DevReportEntryInput & { id?: string }) => {
      const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
      const payload = {
        ...input,
        adr_refs: input.adr_refs ?? [],
        created_by: input.id ? undefined : userId,
      };
      if (input.id) {
        const { data, error } = await supabase
          .from(TABLE as any)
          .update(payload)
          .eq('id', input.id)
          .select('*')
          .single();
        if (error) throw error;
        return data as unknown as DevReportEntry;
      }
      const { data, error } = await supabase
        .from(TABLE as any)
        .insert(payload)
        .select('*')
        .single();
      if (error) throw error;
      return data as unknown as DevReportEntry;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      toast({ title: 'Saved', description: 'Development report entry saved.' });
    },
    onError: (e: Error) =>
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' }),
  });
}

export function useDeleteDevReportEntry() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(TABLE as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      toast({ title: 'Deleted', description: 'Entry removed.' });
    },
    onError: (e: Error) =>
      toast({ title: 'Delete failed', description: e.message, variant: 'destructive' }),
  });
}

/** Format an entry's date column the same way the 101785 evidence sheet does. */
export function formatEntryDateCell(e: Pick<DevReportEntry, 'entry_date' | 'period_label'>): string {
  if (e.entry_date) return e.entry_date;
  return e.period_label ?? '';
}