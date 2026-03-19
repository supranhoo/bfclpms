import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface KpiTemplate {
  id: string;
  title: string;
  description: string | null;
  category_id: string | null;
  kra_name: string;
  kpi_name: string;
  uom: string | null;
  target_value: number | null;
  weightage: number | null;
  criteria: string | null;
  frequency: string | null;
  source_of_data: string | null;
  r5: string | null;
  r4: string | null;
  r3: string | null;
  r2: string | null;
  r1: string | null;
  r0: string | null;
  applicable_roles: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  uom_type?: string | null;
  qualitative_options?: Array<{ label: string; rating: number; definition: string }> | null;
  require_resubmit_reason?: boolean;
  threshold_mode?: 'absolute' | 'ratio' | null;
  kra_categories?: {
    id: string;
    name: string;
    color: string | null;
  } | null;
}

export interface TemplateChangeLog {
  id: string;
  template_id: string;
  changed_by: string;
  effective_month: string;
  effective_year: number;
  fields_changed: Record<string, { old: any; new: any }>;
  employees_affected: number;
  kpis_updated: number;
  scope: string;
  selected_employee_ids: string[];
  created_at: string;
}

export function useKpiTemplates() {
  return useQuery({
    queryKey: ['kpi-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kpi_templates')
        .select(`
          *,
          kra_categories (id, name, color)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as KpiTemplate[];
    },
  });
}

export function useLinkedKpiCounts() {
  return useQuery({
    queryKey: ['template-linked-counts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kpis')
        .select('source_template_id')
        .not('source_template_id', 'is', null);

      if (error) throw error;

      const counts: Record<string, number> = {};
      (data || []).forEach(kpi => {
        const tid = kpi.source_template_id as string;
        counts[tid] = (counts[tid] || 0) + 1;
      });
      return counts;
    },
  });
}

export function useLinkedEmployees(templateId: string | null) {
  return useQuery({
    queryKey: ['template-linked-employees', templateId],
    enabled: !!templateId,
    queryFn: async () => {
      if (!templateId) return [];
      const { data, error } = await supabase
        .from('kpis')
        .select('employee_id, review_period, review_year, status, profiles!kpis_employee_id_fkey(id, full_name, employee_code)')
        .eq('source_template_id', templateId);

      if (error) throw error;

      // Group by employee
      const employeeMap = new Map<string, { id: string; name: string; code: string; kpi_count: number; statuses: string[] }>();
      (data || []).forEach((kpi: any) => {
        const emp = kpi.profiles;
        if (!emp) return;
        const existing = employeeMap.get(emp.id);
        if (existing) {
          existing.kpi_count++;
          if (kpi.status && !existing.statuses.includes(kpi.status)) {
            existing.statuses.push(kpi.status);
          }
        } else {
          employeeMap.set(emp.id, {
            id: emp.id,
            name: emp.full_name || emp.employee_code || 'Unknown',
            code: emp.employee_code || '',
            kpi_count: 1,
            statuses: kpi.status ? [kpi.status] : [],
          });
        }
      });
      return Array.from(employeeMap.values());
    },
  });
}

export function useTemplateChangeHistory(templateId: string | null) {
  return useQuery({
    queryKey: ['template-change-history', templateId],
    enabled: !!templateId,
    queryFn: async () => {
      if (!templateId) return [];
      const { data, error } = await supabase
        .from('template_change_logs')
        .select('*')
        .eq('template_id', templateId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data as TemplateChangeLog[];
    },
  });
}

export function usePropagateTemplateChange() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      template_id: string;
      fields_changed: Record<string, { old: any; new: any }>;
      effective_month: string;
      effective_year: number;
      employee_ids?: string[];
      dry_run?: boolean;
    }) => {
      const { data, error } = await supabase.functions.invoke('propagate-template-change', {
        body: params,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data, variables) => {
      if (!variables.dry_run) {
        queryClient.invalidateQueries({ queryKey: ['kpis'] });
        queryClient.invalidateQueries({ queryKey: ['all-kpis'] });
        queryClient.invalidateQueries({ queryKey: ['my-kpis'] });
        queryClient.invalidateQueries({ queryKey: ['template-linked-counts'] });
        queryClient.invalidateQueries({ queryKey: ['template-change-history'] });
        toast({
          title: 'Changes Propagated',
          description: `Updated ${data.kpis_updated} KPIs across ${data.employees_affected} employees`,
        });
      }
    },
    onError: (error) => {
      toast({
        title: 'Propagation Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useCreateKpiTemplate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (template: Omit<KpiTemplate, 'id' | 'created_at' | 'updated_at' | 'kra_categories'>) => {
      const { data, error } = await supabase
        .from('kpi_templates')
        .insert(template)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kpi-templates'] });
      toast({ title: 'Template created successfully' });
    },
    onError: (error) => {
      toast({ title: 'Failed to create template', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateKpiTemplate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...template }: Partial<KpiTemplate> & { id: string }) => {
      const { data, error } = await supabase
        .from('kpi_templates')
        .update(template)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kpi-templates'] });
      toast({ title: 'Template updated successfully' });
    },
    onError: (error) => {
      toast({ title: 'Failed to update template', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDeleteKpiTemplate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('kpi_templates')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kpi-templates'] });
      toast({ title: 'Template deleted successfully' });
    },
    onError: (error) => {
      toast({ title: 'Failed to delete template', description: error.message, variant: 'destructive' });
    },
  });
}
