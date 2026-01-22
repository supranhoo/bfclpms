import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface TemplateBundle {
  id: string;
  name: string;
  description: string | null;
  department_id: string | null;
  designation: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  departments?: {
    id: string;
    name: string;
  } | null;
  template_bundle_items?: {
    id: string;
    template_id: string;
    sort_order: number;
    kpi_templates: {
      id: string;
      title: string;
      kra_name: string;
      kpi_name: string;
      weightage: number | null;
      kra_categories: {
        id: string;
        name: string;
        color: string | null;
      } | null;
    };
  }[];
}

export interface BundleFormData {
  name: string;
  description: string | null;
  department_id: string | null;
  designation: string | null;
  is_active: boolean;
  template_ids: string[];
}

export function useTemplateBundles() {
  return useQuery({
    queryKey: ['template-bundles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('template_bundles')
        .select(`
          *,
          departments (id, name),
          template_bundle_items (
            id,
            template_id,
            sort_order,
            kpi_templates (
              id,
              title,
              kra_name,
              kpi_name,
              weightage,
              kra_categories (id, name, color)
            )
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as TemplateBundle[];
    },
  });
}

export function useTemplateBundle(id: string | undefined) {
  return useQuery({
    queryKey: ['template-bundle', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('template_bundles')
        .select(`
          *,
          departments (id, name),
          template_bundle_items (
            id,
            template_id,
            sort_order,
            kpi_templates (
              id,
              title,
              kra_name,
              kpi_name,
              weightage,
              kra_categories (id, name, color)
            )
          )
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as TemplateBundle;
    },
    enabled: !!id,
  });
}

export function useCreateTemplateBundle() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (formData: BundleFormData) => {
      const { data: user } = await supabase.auth.getUser();
      
      // Create bundle
      const { data: bundle, error: bundleError } = await supabase
        .from('template_bundles')
        .insert({
          name: formData.name,
          description: formData.description,
          department_id: formData.department_id,
          designation: formData.designation,
          is_active: formData.is_active,
          created_by: user.user?.id,
        })
        .select()
        .single();

      if (bundleError) throw bundleError;

      // Create bundle items
      if (formData.template_ids.length > 0) {
        const items = formData.template_ids.map((templateId, index) => ({
          bundle_id: bundle.id,
          template_id: templateId,
          sort_order: index,
        }));

        const { error: itemsError } = await supabase
          .from('template_bundle_items')
          .insert(items);

        if (itemsError) throw itemsError;
      }

      return bundle;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template-bundles'] });
      toast({ title: 'Bundle created successfully' });
    },
    onError: (error) => {
      toast({ title: 'Failed to create bundle', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateTemplateBundle() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...formData }: BundleFormData & { id: string }) => {
      // Update bundle
      const { error: bundleError } = await supabase
        .from('template_bundles')
        .update({
          name: formData.name,
          description: formData.description,
          department_id: formData.department_id,
          designation: formData.designation,
          is_active: formData.is_active,
        })
        .eq('id', id);

      if (bundleError) throw bundleError;

      // Delete existing items and re-create
      const { error: deleteError } = await supabase
        .from('template_bundle_items')
        .delete()
        .eq('bundle_id', id);

      if (deleteError) throw deleteError;

      // Create new bundle items
      if (formData.template_ids.length > 0) {
        const items = formData.template_ids.map((templateId, index) => ({
          bundle_id: id,
          template_id: templateId,
          sort_order: index,
        }));

        const { error: itemsError } = await supabase
          .from('template_bundle_items')
          .insert(items);

        if (itemsError) throw itemsError;
      }

      return { id };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template-bundles'] });
      toast({ title: 'Bundle updated successfully' });
    },
    onError: (error) => {
      toast({ title: 'Failed to update bundle', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDeleteTemplateBundle() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('template_bundles')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template-bundles'] });
      toast({ title: 'Bundle deleted successfully' });
    },
    onError: (error) => {
      toast({ title: 'Failed to delete bundle', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDuplicateTemplateBundle() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (bundleId: string) => {
      const { data: user } = await supabase.auth.getUser();
      
      // Fetch existing bundle with items
      const { data: original, error: fetchError } = await supabase
        .from('template_bundles')
        .select(`
          *,
          template_bundle_items (template_id, sort_order)
        `)
        .eq('id', bundleId)
        .single();

      if (fetchError) throw fetchError;

      // Create duplicate bundle with "(Copy)" suffix
      const { data: newBundle, error: bundleError } = await supabase
        .from('template_bundles')
        .insert({
          name: `${original.name} (Copy)`,
          description: original.description,
          department_id: original.department_id,
          designation: original.designation,
          is_active: false, // Start as inactive
          created_by: user.user?.id,
        })
        .select()
        .single();

      if (bundleError) throw bundleError;

      // Duplicate bundle items
      if (original.template_bundle_items?.length > 0) {
        const items = original.template_bundle_items.map((item: { template_id: string; sort_order: number }) => ({
          bundle_id: newBundle.id,
          template_id: item.template_id,
          sort_order: item.sort_order,
        }));

        const { error: itemsError } = await supabase
          .from('template_bundle_items')
          .insert(items);

        if (itemsError) throw itemsError;
      }

      return newBundle;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['template-bundles'] });
      toast({ title: 'Bundle duplicated', description: `Created "${data.name}"` });
    },
    onError: (error) => {
      toast({ title: 'Failed to duplicate bundle', description: error.message, variant: 'destructive' });
    },
  });
}

// Assignment history types and hooks
export interface BundleAssignmentLog {
  id: string;
  bundle_id: string;
  employee_id: string;
  assigned_by: string | null;
  review_period: string;
  review_year: number;
  kpis_created: number;
  created_at: string;
  template_bundles?: {
    id: string;
    name: string;
  } | null;
  profiles?: {
    id: string;
    full_name: string | null;
    email: string;
    employee_code: string | null;
  } | null;
  assigned_by_profile?: {
    id: string;
    full_name: string | null;
    email: string;
  } | null;
}

export function useBundleAssignmentLogs(bundleId?: string) {
  return useQuery({
    queryKey: ['bundle-assignment-logs', bundleId],
    queryFn: async () => {
      let query = supabase
        .from('bundle_assignment_logs')
        .select(`
          *,
          template_bundles (id, name),
          profiles!bundle_assignment_logs_employee_id_fkey (id, full_name, email, employee_code),
          assigned_by_profile:profiles!bundle_assignment_logs_assigned_by_fkey (id, full_name, email)
        `)
        .order('created_at', { ascending: false });

      if (bundleId) {
        query = query.eq('bundle_id', bundleId);
      }

      const { data, error } = await query.limit(100);

      if (error) throw error;
      return data as BundleAssignmentLog[];
    },
  });
}

export function useLogBundleAssignment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (logs: {
      bundle_id: string;
      employee_id: string;
      review_period: string;
      review_year: number;
      kpis_created: number;
    }[]) => {
      const { data: user } = await supabase.auth.getUser();
      
      const logsWithAssigner = logs.map(log => ({
        ...log,
        assigned_by: user.user?.id,
      }));

      const { error } = await supabase
        .from('bundle_assignment_logs')
        .insert(logsWithAssigner);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bundle-assignment-logs'] });
    },
  });
}
