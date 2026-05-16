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
  review_period: string | null;
  review_year: number | null;
  is_ongoing: boolean;
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
export function useEmployeeWorkflow(employeeId: string | undefined, reviewPeriod?: string, reviewYear?: number) {
  return useQuery({
    queryKey: ['employee-workflow', employeeId, reviewPeriod, reviewYear],
    queryFn: async () => {
      if (!employeeId) return null;
      
      const params: Record<string, unknown> = { employee_uuid: employeeId };
      if (reviewPeriod && reviewYear) {
        params.p_review_period = reviewPeriod;
        params.p_review_year = reviewYear;
      }
      
      const { data, error } = await supabase
        .rpc('get_employee_workflow_info', params as any);
      
      if (error) throw error;
      
      if (data && data.length > 0) {
        return data[0] as EmployeeWorkflowInfo;
      }
      
      return null;
    },
    enabled: !!employeeId,
  });
}

// Get employee's workflow stages only
export function useEmployeeWorkflowStages(employeeId: string | undefined, reviewPeriod?: string, reviewYear?: number) {
  return useQuery({
    queryKey: ['employee-workflow-stages', employeeId, reviewPeriod, reviewYear],
    queryFn: async () => {
      if (!employeeId) return null;
      
      const params: Record<string, unknown> = { employee_uuid: employeeId };
      if (reviewPeriod && reviewYear) {
        params.p_review_period = reviewPeriod;
        params.p_review_year = reviewYear;
      }
      
      const { data, error } = await supabase
        .rpc('get_employee_workflow', params as any);
      
      if (error) throw error;
      return data as string[];
    },
    enabled: !!employeeId,
  });
}

// Helper to trigger auto-reconciliation after workflow changes
async function triggerAutoReconcile(reviewPeriod: string, reviewYear: number) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const response = await fetch(
    `https://${projectId}.supabase.co/functions/v1/auto-reconcile-workflow`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({ review_period: reviewPeriod, review_year: reviewYear }),
    }
  );
  if (response.ok) {
    const result = await response.json();
    if (result.reconciled_count > 0) {
      console.log(`Auto-reconciled ${result.reconciled_count} KPIs after workflow change`);
      // Import toast dynamically to show feedback
      try {
        const { toast } = await import('sonner');
        toast.success(`${result.reconciled_count} KPI(s) auto-reconciled due to workflow change`);
      } catch { /* sonner not available — silent */ }
    }
  }
}

// Create or update a workflow configuration
export function useUpsertWorkflowConfig() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({
      configType,
      configValue,
      workflowTemplateId,
      reviewPeriod,
      reviewYear,
      isOngoing,
    }: {
      configType: 'employee' | 'department' | 'pms_grade';
      configValue: string;
      workflowTemplateId: string;
      reviewPeriod?: string | null;
      reviewYear?: number | null;
      isOngoing?: boolean;
    }) => {
      const record: Record<string, unknown> = {
        config_type: configType,
        config_value: configValue,
        workflow_template_id: workflowTemplateId,
        review_period: reviewPeriod || null,
        review_year: reviewYear || null,
        is_ongoing: isOngoing || false,
      };

      // Use different onConflict based on whether it's period-specific or global
      // Since we use partial unique indexes, we need to handle conflicts manually
      // First try to find existing record
      let existingQuery = supabase
        .from('workflow_config')
        .select('id')
        .eq('config_type', configType)
        .eq('config_value', configValue);

      if (reviewPeriod && reviewYear) {
        existingQuery = existingQuery.eq('review_period', reviewPeriod).eq('review_year', reviewYear);
      } else {
        existingQuery = existingQuery.is('review_period', null);
      }

      const { data: existing } = await existingQuery.maybeSingle();

      if (existing) {
        const { data, error } = await supabase
          .from('workflow_config')
          .update({ workflow_template_id: workflowTemplateId, is_ongoing: isOngoing || false } as any)
          .eq('id', existing.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from('workflow_config')
          .insert(record as any)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: async (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['workflow-configs'] });
      queryClient.invalidateQueries({ queryKey: ['employee-workflow'] });
      queryClient.invalidateQueries({ queryKey: ['employee-workflow-stages'] });
      queryClient.invalidateQueries({ queryKey: ['bulk-employee-workflows'] });
      queryClient.invalidateQueries({ queryKey: ['kpis'] });

      // Check if the trigger stepped back any KPIs
      try {
        const { data: stepBackLogs } = await supabase
          .from('kpi_audit_logs')
          .select('kpi_id, metadata')
          .eq('action', 'WORKFLOW_CHANGE_STEP_BACK')
          .gte('created_at', new Date(Date.now() - 10000).toISOString())
          .order('created_at', { ascending: false });

        if (stepBackLogs && stepBackLogs.length > 0) {
          const { toast } = await import('sonner');
          const stepBackTo = (stepBackLogs[0].metadata as any)?.step_back_to || 'earlier stage';
          toast.warning(
            `${stepBackLogs.length} approved KPI(s) were stepped back to "${getStageLabel(stepBackTo)}" because the new workflow adds review stages beyond the previous terminal reviewer.`,
            { duration: 8000 }
          );
        }
      } catch { /* best-effort notification */ }

      // Auto-reconcile in-flight KPIs for the affected period
      const period = variables.reviewPeriod;
      const year = variables.reviewYear;
      if (period && year) {
        triggerAutoReconcile(period, year).catch(() => {
          // Silently fail — reconciliation is best-effort
        });
      }
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

// Set a workflow template as the new default
export function useSetDefaultWorkflowTemplate() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (templateId: string) => {
      const { error: unsetError } = await supabase
        .from('workflow_templates')
        .update({ is_default: false })
        .neq('id', templateId);
      
      if (unsetError) throw unsetError;
      
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

// Delete a workflow template
export function useDeleteWorkflowTemplate() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (templateId: string) => {
      const { data: configs, error: checkError } = await supabase
        .from('workflow_config')
        .select('id')
        .eq('workflow_template_id', templateId)
        .limit(1);
      
      if (checkError) throw checkError;
      if (configs && configs.length > 0) {
        throw new Error('Cannot delete: this template is currently assigned to employees, departments, or PMS grades.');
      }
      
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

// Batch-update is_ongoing for all configs in a specific period
export function useUpdateBatchOngoing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      reviewPeriod,
      reviewYear,
      isOngoing,
    }: {
      reviewPeriod: string;
      reviewYear: number;
      isOngoing: boolean;
    }) => {
      const { data, error } = await supabase
        .from('workflow_config')
        .update({ is_ongoing: isOngoing } as any)
        .eq('review_period', reviewPeriod)
        .eq('review_year', reviewYear)
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-configs'] });
      queryClient.invalidateQueries({ queryKey: ['employee-workflow'] });
      queryClient.invalidateQueries({ queryKey: ['employee-workflow-stages'] });
      queryClient.invalidateQueries({ queryKey: ['bulk-employee-workflows'] });
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
export function useBulkEmployeeWorkflows(employeeIds: string[], reviewPeriod?: string, reviewYear?: number) {
  return useQuery({
    queryKey: ['bulk-employee-workflows', employeeIds.sort().join(','), reviewPeriod, reviewYear],
    queryFn: async () => {
      if (employeeIds.length === 0) return new Map<string, string[]>();

      // v2.66.11.18 (POLICY §125) — chunk inputs to dodge PostgREST's
      // server-side 1000-row cap. With >1000 ids the RPC silently truncated
      // the response, leaving employees alphabetically past the cut-off with
      // NO workflow entry → reviewer panels (HR PMS / Audit / Skip-Level /
      // Management) excluded their cards even though tile counts via score
      // signatures still included them. Mirrors the resilient chunked
      // pattern in `useProfilesByWorkflowStage`.
      const CHUNK = 500;
      const chunks: string[][] = [];
      for (let i = 0; i < employeeIds.length; i += CHUNK) {
        chunks.push(employeeIds.slice(i, i + CHUNK));
      }

      const callChunk = async (ids: string[]) => {
        const params: Record<string, unknown> = { employee_ids: ids };
        if (reviewPeriod && reviewYear) {
          params.p_review_period = reviewPeriod;
          params.p_review_year = reviewYear;
        }
        const first = await (supabase as any).rpc('get_bulk_employee_workflows', params);
        if (!first.error) return first;
        await new Promise(r => setTimeout(r, 200));
        return await (supabase as any).rpc('get_bulk_employee_workflows', params);
      };

      const results = await Promise.all(chunks.map(callChunk));
      const map = new Map<string, string[]>();
      for (const r of results) {
        if (r.error) throw r.error;
        for (const row of ((r.data || []) as { employee_id: string; stages: string[] }[])) {
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
