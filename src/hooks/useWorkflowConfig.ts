import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface WorkflowTemplate {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  stages: string[];
  is_default: boolean;
  is_active: boolean;
}

export interface WorkflowConfig {
  id: string;
  config_type: 'employee' | 'department' | 'pms_grade';
  config_value: string;
  workflow_template_id: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface EmployeeWorkflowInfo {
  template_id: string;
  template_name: string;
  display_name: string;
  stages: string[];
  config_source: 'employee' | 'department' | 'pms_grade' | 'default';
}

// Fetch all workflow templates (optionally include archived)
export function useWorkflowTemplates(includeArchived = false) {
  return useQuery({
    queryKey: ['workflow-templates', includeArchived],
    queryFn: async () => {
      let query = supabase
        .from('workflow_templates')
        .select('*')
        .order('name');
      
      if (!includeArchived) {
        query = query.eq('is_active', true);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as WorkflowTemplate[];
    },
  });
}

// Fetch all workflow configurations
export function useWorkflowConfigs() {
  return useQuery({
    queryKey: ['workflow-configs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workflow_config')
        .select('*')
        .order('config_type', { ascending: true });
      
      if (error) throw error;
      return data as WorkflowConfig[];
    },
  });
}

// Fetch employee's effective workflow using the database function
export function useEmployeeWorkflow(employeeId: string | undefined) {
  return useQuery({
    queryKey: ['employee-workflow', employeeId],
    queryFn: async () => {
      if (!employeeId) return null;
      
      const { data, error } = await supabase
        .rpc('get_employee_workflow_info', { employee_uuid: employeeId });
      
      if (error) throw error;
      
      // The function returns a table, so we get the first row
      if (data && data.length > 0) {
        return data[0] as EmployeeWorkflowInfo;
      }
      
      return null;
    },
    enabled: !!employeeId,
  });
}

// Get employee's workflow stages only
export function useEmployeeWorkflowStages(employeeId: string | undefined) {
  return useQuery({
    queryKey: ['employee-workflow-stages', employeeId],
    queryFn: async () => {
      if (!employeeId) return null;
      
      const { data, error } = await supabase
        .rpc('get_employee_workflow', { employee_uuid: employeeId });
      
      if (error) throw error;
      return data as string[];
    },
    enabled: !!employeeId,
  });
}

// Create or update a workflow configuration
export function useUpsertWorkflowConfig() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({
      configType,
      configValue,
      workflowTemplateId,
    }: {
      configType: 'employee' | 'department' | 'pms_grade';
      configValue: string;
      workflowTemplateId: string;
    }) => {
      const { data, error } = await supabase
        .from('workflow_config')
        .upsert(
          {
            config_type: configType,
            config_value: configValue,
            workflow_template_id: workflowTemplateId,
          },
          { onConflict: 'config_type,config_value' }
        )
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-configs'] });
      queryClient.invalidateQueries({ queryKey: ['employee-workflow'] });
      queryClient.invalidateQueries({ queryKey: ['employee-workflow-stages'] });
    },
  });
}

// Create a new workflow template
export function useCreateWorkflowTemplate() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({
      name,
      displayName,
      description,
      stages,
    }: {
      name: string;
      displayName: string;
      description?: string;
      stages: string[];
    }) => {
      const { data, error } = await supabase
        .from('workflow_templates')
        .insert({
          name,
          display_name: displayName,
          description: description || null,
          stages,
          is_default: false,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-templates'] });
    },
  });
}

// Update an existing workflow template
export function useUpdateWorkflowTemplate() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({
      id,
      name,
      displayName,
      description,
      stages,
    }: {
      id: string;
      name: string;
      displayName: string;
      description?: string;
      stages: string[];
    }) => {
      const { data, error } = await supabase
        .from('workflow_templates')
        .update({
          name,
          display_name: displayName,
          description: description || null,
          stages,
        })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-templates'] });
    },
  });
}

// Set a workflow template as the new default (only affects inherit/fallback cascade)
export function useSetDefaultWorkflowTemplate() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (templateId: string) => {
      // Unset all defaults
      const { error: unsetError } = await supabase
        .from('workflow_templates')
        .update({ is_default: false })
        .neq('id', templateId);
      
      if (unsetError) throw unsetError;
      
      // Set new default
      const { error: setError } = await supabase
        .from('workflow_templates')
        .update({ is_default: true })
        .eq('id', templateId);
      
      if (setError) throw setError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-templates'] });
      queryClient.invalidateQueries({ queryKey: ['employee-workflow'] });
      queryClient.invalidateQueries({ queryKey: ['employee-workflow-stages'] });
    },
  });
}

// Delete a workflow template (only if not in use and no active KPIs)
export function useDeleteWorkflowTemplate() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (templateId: string) => {
      // Check if any configs reference this template
      const { data: configs, error: checkError } = await supabase
        .from('workflow_config')
        .select('id')
        .eq('workflow_template_id', templateId)
        .limit(1);
      
      if (checkError) throw checkError;
      if (configs && configs.length > 0) {
        throw new Error('Cannot delete: this template is currently assigned to employees, departments, or PMS grades.');
      }
      
      // Check for active KPIs using this template
      const { data: hasActiveKpis, error: kpiCheckError } = await supabase
        .rpc('check_template_has_active_kpis', { template_uuid: templateId });
      
      if (kpiCheckError) throw kpiCheckError;
      if (hasActiveKpis) {
        throw new Error('Cannot delete: employees using this template have in-progress KPIs. Archive it instead.');
      }
      
      const { error } = await supabase
        .from('workflow_templates')
        .delete()
        .eq('id', templateId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-templates'] });
    },
  });
}

// Archive a workflow template (soft delete)
export function useArchiveWorkflowTemplate() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (templateId: string) => {
      // Check for active KPIs before archiving
      const { data: hasActiveKpis, error: kpiCheckError } = await supabase
        .rpc('check_template_has_active_kpis', { template_uuid: templateId });
      
      if (kpiCheckError) throw kpiCheckError;
      if (hasActiveKpis) {
        throw new Error('Cannot archive: employees using this template have in-progress KPIs.');
      }
      
      const { error } = await supabase
        .from('workflow_templates')
        .update({ is_active: false } as any)
        .eq('id', templateId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-templates'] });
      queryClient.invalidateQueries({ queryKey: ['employee-workflow'] });
      queryClient.invalidateQueries({ queryKey: ['employee-workflow-stages'] });
    },
  });
}

// Restore an archived workflow template
export function useRestoreWorkflowTemplate() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (templateId: string) => {
      const { error } = await supabase
        .from('workflow_templates')
        .update({ is_active: true } as any)
        .eq('id', templateId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-templates'] });
    },
  });
}

// Delete a workflow configuration
export function useDeleteWorkflowConfig() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (configId: string) => {
      const { error } = await supabase
        .from('workflow_config')
        .delete()
        .eq('id', configId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-configs'] });
      queryClient.invalidateQueries({ queryKey: ['employee-workflow'] });
      queryClient.invalidateQueries({ queryKey: ['employee-workflow-stages'] });
    },
  });
}

/**
 * Get the next status in the workflow for a specific employee
 */
export function getNextWorkflowStatus(
  currentStatus: string,
  workflowStages: string[]
): string | null {
  const currentIndex = workflowStages.indexOf(currentStatus);
  if (currentIndex === -1 || currentIndex >= workflowStages.length - 1) {
    return null;
  }
  return workflowStages[currentIndex + 1];
}

/**
 * Check if a specific stage exists in the employee's workflow
 */
export function hasWorkflowStage(stage: string, workflowStages: string[]): boolean {
  return workflowStages.includes(stage);
}

/**
 * Batch-fetch workflow stages for multiple employees in a single RPC call.
 * Returns a map of employeeId -> stages[].
 */
export function useBulkEmployeeWorkflows(employeeIds: string[]) {
  return useQuery({
    queryKey: ['bulk-employee-workflows', employeeIds.sort().join(',')],
    queryFn: async () => {
      if (employeeIds.length === 0) return new Map<string, string[]>();

      const { data, error } = await supabase
        .rpc('get_bulk_employee_workflows' as any, { employee_ids: employeeIds }) as { data: { employee_id: string; stages: string[] }[] | null; error: any };

      if (error) throw error;

      const map = new Map<string, string[]>();
      if (data) {
        for (const row of data) {
          map.set(row.employee_id, row.stages);
        }
      }
      return map;
    },
    enabled: employeeIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Get display label for a workflow stage
 */
export function getStageLabel(stage: string): string {
  const labels: Record<string, string> = {
    kra_set: 'KRA Set',
    self_review: 'Self Review',
    manager_check: 'Manager Review',
    skip_level_check: 'Skip-Level Review',
    hr_pms_review: 'HR PMS Review',
    audit: 'Audit Review',
    admin_review: 'Admin Review',
    management_review: 'Management Review',
    approved: 'Approved',
  };
  return labels[stage] || stage;
}
