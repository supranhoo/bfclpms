import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface WorkflowTemplate {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  stages: string[];
  is_default: boolean;
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

// Fetch all workflow templates
export function useWorkflowTemplates() {
  return useQuery({
    queryKey: ['workflow-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workflow_templates')
        .select('*')
        .order('name');
      
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
