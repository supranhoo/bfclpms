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
