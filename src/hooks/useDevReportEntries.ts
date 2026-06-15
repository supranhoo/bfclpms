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

export function useDevReportEntries(entryType?: DevReportEntryType) {
  return useQuery({
    queryKey: [...KEY, entryType ?? 'all'],
    queryFn: async (): Promise<DevReportEntry[]> => {
      let q = supabase
        .from(TABLE as any)
        .select('*')
        .order('entry_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });
      if (entryType) q = q.eq('entry_type', entryType);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as DevReportEntry[];
    },
    staleTime: 60 * 1000,
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