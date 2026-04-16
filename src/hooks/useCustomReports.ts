import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface CustomReport {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  category: string | null;
  columns: { key: string; alias?: string; width?: string }[];
  filters: { field: string; operator: string; value: string; user_selectable?: boolean }[];
  default_sort: { field: string; direction: 'asc' | 'desc' } | null;
  group_by: string | null;
  export_excel: boolean;
  export_pdf: boolean;
  filename_template: string | null;
  view_roles: string[];
  is_active: boolean;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

type CustomReportInsert = Omit<CustomReport, 'id' | 'created_at' | 'updated_at'>;

export function useCustomReports() {
  return useQuery({
    queryKey: ['custom-reports'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('custom_reports')
        .select('*')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as CustomReport[];
    },
  });
}

export function useActiveCustomReports() {
  return useQuery({
    queryKey: ['custom-reports', 'active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('custom_reports')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as CustomReport[];
    },
  });
}

export function useCustomReport(id: string | undefined) {
  return useQuery({
    queryKey: ['custom-reports', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('custom_reports')
        .select('*')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data as unknown as CustomReport;
    },
  });
}

export function useCreateCustomReport() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (report: Partial<CustomReportInsert>) => {
      const { data, error } = await supabase
        .from('custom_reports')
        .insert({
          name: report.name || 'Untitled Report',
          description: report.description ?? null,
          icon: report.icon || 'FileText',
          color: report.color || 'text-primary',
          category: report.category ?? 'Custom',
          columns: report.columns as any || [],
          filters: report.filters as any || [],
          default_sort: report.default_sort as any ?? null,
          group_by: report.group_by ?? null,
          export_excel: report.export_excel ?? true,
          export_pdf: report.export_pdf ?? false,
          filename_template: report.filename_template ?? null,
          view_roles: report.view_roles || ['admin'],
          is_active: report.is_active ?? true,
          sort_order: report.sort_order ?? 0,
          created_by: (await supabase.auth.getUser()).data.user?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-reports'] });
      toast({ title: 'Report Created', description: 'Custom report has been created successfully.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateCustomReport() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<CustomReport> & { id: string }) => {
      const payload: Record<string, any> = {};
      if (updates.name !== undefined) payload.name = updates.name;
      if (updates.description !== undefined) payload.description = updates.description;
      if (updates.icon !== undefined) payload.icon = updates.icon;
      if (updates.color !== undefined) payload.color = updates.color;
      if (updates.category !== undefined) payload.category = updates.category;
      if (updates.columns !== undefined) payload.columns = updates.columns;
      if (updates.filters !== undefined) payload.filters = updates.filters;
      if (updates.default_sort !== undefined) payload.default_sort = updates.default_sort;
      if (updates.group_by !== undefined) payload.group_by = updates.group_by;
      if (updates.export_excel !== undefined) payload.export_excel = updates.export_excel;
      if (updates.export_pdf !== undefined) payload.export_pdf = updates.export_pdf;
      if (updates.filename_template !== undefined) payload.filename_template = updates.filename_template;
      if (updates.view_roles !== undefined) payload.view_roles = updates.view_roles;
      if (updates.is_active !== undefined) payload.is_active = updates.is_active;
      if (updates.sort_order !== undefined) payload.sort_order = updates.sort_order;

      const { data, error } = await supabase
        .from('custom_reports')
        .update(payload)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-reports'] });
      toast({ title: 'Report Updated', description: 'Custom report has been updated.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDeleteCustomReport() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('custom_reports')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-reports'] });
      toast({ title: 'Report Deleted', description: 'Custom report has been removed.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}
