import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface CustomTabField {
  key: string;
  label: string;
  type: 'number' | 'text' | 'boolean' | 'date';
  default_value?: string;
}

export interface CustomTab {
  id: string;
  program_id: string;
  tab_key: string;
  tab_label: string;
  sort_order: number;
  is_active: boolean;
  fields: CustomTabField[];
  created_at: string;
}

export interface CustomTabDataRow {
  id: string;
  tab_id: string;
  program_id: string;
  employee_id: string;
  field_values: Record<string, any>;
  created_at: string;
  updated_at: string;
  // joined
  employee_name?: string;
  employee_code?: string;
}

/* ── Fetch custom tabs for a program ── */
export function useCustomTabs(programId: string) {
  return useQuery({
    queryKey: ['incentive-custom-tabs', programId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('incentive_program_custom_tabs')
        .select('*')
        .eq('program_id', programId)
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return (data || []).map((d: any) => ({
        ...d,
        fields: (typeof d.fields === 'string' ? JSON.parse(d.fields) : d.fields) as CustomTabField[],
      })) as CustomTab[];
    },
    enabled: !!programId,
  });
}

/* ── Upsert custom tab definition ── */
export function useUpsertCustomTab() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tab: {
      id?: string;
      program_id: string;
      tab_key: string;
      tab_label: string;
      sort_order?: number;
      fields: CustomTabField[];
    }) => {
      if (tab.id) {
        const { error } = await supabase
          .from('incentive_program_custom_tabs')
          .update({
            tab_label: tab.tab_label,
            tab_key: tab.tab_key,
            fields: tab.fields as any,
            sort_order: tab.sort_order ?? 0,
          })
          .eq('id', tab.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('incentive_program_custom_tabs')
          .insert({
            program_id: tab.program_id,
            tab_key: tab.tab_key,
            tab_label: tab.tab_label,
            sort_order: tab.sort_order ?? 0,
            fields: tab.fields as any,
          });
        if (error) throw error;
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['incentive-custom-tabs', vars.program_id] });
      toast.success('Tab saved');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

/* ── Delete custom tab ── */
export function useDeleteCustomTab() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, programId }: { id: string; programId: string }) => {
      const { error } = await supabase
        .from('incentive_program_custom_tabs')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return programId;
    },
    onSuccess: (programId) => {
      qc.invalidateQueries({ queryKey: ['incentive-custom-tabs', programId] });
      toast.success('Tab deleted');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

/* ── Fetch tab data rows (joined with profiles) ── */
export function useCustomTabData(tabId: string, programId: string) {
  return useQuery({
    queryKey: ['incentive-custom-tab-data', tabId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('incentive_custom_tab_data')
        .select('*')
        .eq('tab_id', tabId)
        .eq('program_id', programId);
      if (error) throw error;
      if (!data || data.length === 0) return [] as CustomTabDataRow[];

      // Fetch employee profiles
      const empIds = data.map((d: any) => d.employee_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, employee_code')
        .in('id', empIds);
      const profileMap = new Map(
        (profiles || []).map((p: any) => [p.id, p])
      );

      return data.map((d: any) => {
        const prof = profileMap.get(d.employee_id);
        return {
          ...d,
          field_values: typeof d.field_values === 'string' ? JSON.parse(d.field_values) : d.field_values,
          employee_name: prof?.full_name || 'Unknown',
          employee_code: prof?.employee_code || '',
        } as CustomTabDataRow;
      });
    },
    enabled: !!tabId && !!programId,
  });
}

/* ── Upsert tab data row ── */
export function useUpsertCustomTabData() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: {
      id?: string;
      tab_id: string;
      program_id: string;
      employee_id: string;
      field_values: Record<string, any>;
    }) => {
      if (row.id) {
        const { error } = await supabase
          .from('incentive_custom_tab_data')
          .update({
            field_values: row.field_values as any,
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('incentive_custom_tab_data')
          .insert({
            tab_id: row.tab_id,
            program_id: row.program_id,
            employee_id: row.employee_id,
            field_values: row.field_values as any,
          });
        if (error) throw error;
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['incentive-custom-tab-data', vars.tab_id] });
      toast.success('Data saved');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

/* ── Delete tab data row ── */
export function useDeleteCustomTabData() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, tabId }: { id: string; tabId: string }) => {
      const { error } = await supabase
        .from('incentive_custom_tab_data')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return tabId;
    },
    onSuccess: (tabId) => {
      qc.invalidateQueries({ queryKey: ['incentive-custom-tab-data', tabId] });
      toast.success('Row deleted');
    },
    onError: (e: any) => toast.error(e.message),
  });
}
