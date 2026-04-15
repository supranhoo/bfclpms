import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type SettingCategory = 'submission' | 'sla' | 'validation' | 'observation' | 'export';

export interface WorkflowSetting {
  id: string;
  category: SettingCategory;
  setting_key: string;
  setting_value: string | number | boolean;
  label: string;
  description: string | null;
  min_value: number | null;
  max_value: number | null;
  unit: string | null;
  created_at: string;
  updated_at: string;
}

interface WorkflowSettingRow {
  id: string;
  category: string;
  setting_key: string;
  setting_value: string | number | boolean;
  label: string;
  description: string | null;
  min_value: number | null;
  max_value: number | null;
  unit: string | null;
  created_at: string;
  updated_at: string;
}

// Default values for fallback
const DEFAULT_VALUES: Record<string, string | number | boolean> = {
  // Submission Windows
  daily_submission_window_days: 2,
  resubmission_grace_hours: 0,
  working_days_per_month: 22,
  
  // SLA Thresholds
  query_sla_target_days: 2,
  query_sla_warning_days: 5,
  query_sla_critical_days: 10,
  stalled_kpi_warning_days: 14,
  stalled_kpi_critical_days: 30,
  pending_kra_warning_days: 7,
  pending_kra_critical_days: 14,
  
  // Validation Rules
  na_reason_min_chars: 50,
  require_evidence_default: false,
  password_min_length: 6,
  
  // Observation Settings
  max_observation_impact: 5,
  self_observation_auto_apply: false,
  
  // Remarks Mandatory Settings
  remarks_mandatory_self: true,
  remarks_mandatory_manager: true,
  remarks_mandatory_skip_level: true,
  remarks_mandatory_hr_pms: true,
  remarks_mandatory_auditor: true,
  remarks_mandatory_management: false,
  
  // Org KPI self-entry
  org_kpi_employee_self_entry: false,
  
  // Visibility
  show_data_owner_to_employees: true,
};

function parseSettingValue(value: unknown): string | number | boolean {
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    // Try to parse as number
    const num = parseFloat(value);
    if (!isNaN(num)) return num;
    // Check for boolean strings
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  }
  return String(value);
}

/**
 * Fetch all workflow settings or filter by category
 */
export function useWorkflowSettings(category?: SettingCategory) {
  return useQuery({
    queryKey: ['workflow-settings', category],
    queryFn: async () => {
      let query = supabase
        .from('workflow_settings')
        .select('*')
        .order('category')
        .order('setting_key');
      
      if (category) {
        query = query.eq('category', category);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      return (data as WorkflowSettingRow[]).map(row => ({
        ...row,
        category: row.category as SettingCategory,
        setting_value: parseSettingValue(row.setting_value),
      })) as WorkflowSetting[];
    },
  });
}

/**
 * Fetch a single workflow setting by key
 */
export function useWorkflowSetting(key: string) {
  return useQuery({
    queryKey: ['workflow-settings', 'single', key],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workflow_settings')
        .select('*')
        .eq('setting_key', key)
        .maybeSingle();
      
      if (error) throw error;
      if (!data) return null;
      
      return {
        ...data,
        category: data.category as SettingCategory,
        setting_value: parseSettingValue(data.setting_value),
      } as WorkflowSetting;
    },
  });
}

/**
 * Update a workflow setting value
 */
export function useUpdateWorkflowSetting() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string | number | boolean }) => {
      const { data, error } = await supabase
        .from('workflow_settings')
        .update({ setting_value: value })
        .eq('setting_key', key)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['workflow-settings'] });
      toast({
        title: 'Setting Updated',
        description: `${variables.key.replace(/_/g, ' ')} has been updated.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// ============= Convenience Hooks =============

/**
 * Get the daily submission window (how many past days employees can submit)
 */
export function useDailySubmissionWindow(): number {
  const { data, isLoading } = useWorkflowSetting('daily_submission_window_days');
  
  if (isLoading || !data) {
    return DEFAULT_VALUES.daily_submission_window_days as number;
  }
  
  return typeof data.setting_value === 'number' 
    ? data.setting_value 
    : parseInt(String(data.setting_value), 10) || 2;
}

/**
 * Get working days per month for missed days penalty calculation
 */
export function useWorkingDaysPerMonth(): number {
  const { data, isLoading } = useWorkflowSetting('working_days_per_month');
  
  if (isLoading || !data) {
    return DEFAULT_VALUES.working_days_per_month as number;
  }
  
  return typeof data.setting_value === 'number'
    ? data.setting_value
    : parseInt(String(data.setting_value), 10) || 22;
}

/**
 * Get SLA thresholds for all issue types
 */
export function useSlaThresholds() {
  const { data: settings = [], isLoading } = useWorkflowSettings('sla');
  
  const getValue = (key: string, defaultValue: number): number => {
    const setting = settings.find(s => s.setting_key === key);
    if (!setting) return defaultValue;
    return typeof setting.setting_value === 'number'
      ? setting.setting_value
      : parseInt(String(setting.setting_value), 10) || defaultValue;
  };
  
  return {
    isLoading,
    thresholds: {
      query: {
        warning: getValue('query_sla_warning_days', 5),
        critical: getValue('query_sla_critical_days', 10),
      },
      training_need: {
        warning: 14,
        critical: 30,
      },
      pip: {
        warning: 7,
        critical: 14,
      },
      pip_milestone: {
        warning: 0,
        critical: 7,
      },
      stalled_kpi: {
        warning: getValue('stalled_kpi_warning_days', 14),
        critical: getValue('stalled_kpi_critical_days', 30),
      },
      pending_kra: {
        warning: getValue('pending_kra_warning_days', 7),
        critical: getValue('pending_kra_critical_days', 14),
      },
    },
  };
}

/**
 * Get validation rules settings
 */
export function useValidationRules() {
  const { data: settings = [], isLoading } = useWorkflowSettings('validation');
  
  const getValue = <T extends string | number | boolean>(key: string, defaultValue: T): T => {
    const setting = settings.find(s => s.setting_key === key);
    if (!setting) return defaultValue;
    return setting.setting_value as T;
  };
  
  return {
    isLoading,
    rules: {
      naReasonMinChars: getValue('na_reason_min_chars', 50) as number,
      requireEvidenceDefault: getValue('require_evidence_default', false) as boolean,
      passwordMinLength: getValue('password_min_length', 6) as number,
    },
  };
}

/**
 * Get observation settings
 */
export function useObservationSettings() {
  const { data: settings = [], isLoading } = useWorkflowSettings('observation');
  
  const getValue = <T extends string | number | boolean>(key: string, defaultValue: T): T => {
    const setting = settings.find(s => s.setting_key === key);
    if (!setting) return defaultValue;
    return setting.setting_value as T;
  };
  
  return {
    isLoading,
    settings: {
      maxScoreImpact: getValue('max_observation_impact', 5) as number,
      selfObservationAutoApply: getValue('self_observation_auto_apply', false) as boolean,
    },
  };
}

/**
 * Get all settings grouped by category
 */
export function useAllWorkflowSettings() {
  const { data: settings = [], isLoading, error } = useWorkflowSettings();
  
  const grouped = settings.reduce((acc, setting) => {
    if (!acc[setting.category]) {
      acc[setting.category] = [];
    }
    acc[setting.category].push(setting);
    return acc;
  }, {} as Record<SettingCategory, WorkflowSetting[]>);
  
  return { grouped, settings, isLoading, error };
}

/**
 * Get remarks mandatory settings per review level
 */
export function useRemarksMandatorySettings() {
  const { data: settings = [], isLoading } = useWorkflowSettings('validation');
  
  const getBool = (key: string, defaultValue: boolean): boolean => {
    const setting = settings.find(s => s.setting_key === key);
    if (!setting) return defaultValue;
    if (typeof setting.setting_value === 'boolean') return setting.setting_value;
    if (setting.setting_value === 'true') return true;
    if (setting.setting_value === 'false') return false;
    return defaultValue;
  };
  
  return {
    isLoading,
    self: getBool('remarks_mandatory_self', true),
    manager: getBool('remarks_mandatory_manager', true),
    skip_level: getBool('remarks_mandatory_skip_level', true),
    hr_pms: getBool('remarks_mandatory_hr_pms', true),
    auditor: getBool('remarks_mandatory_auditor', true),
    management: getBool('remarks_mandatory_management', false),
  };
}

/**
 * Check if employees are allowed to self-enter achieved values for Org KPIs.
 * Default: false (locked — only Data Owners / Admins can enter).
 */
export function useOrgKpiSelfEntryAllowed(): boolean {
  const { data, isLoading } = useWorkflowSetting('org_kpi_employee_self_entry');

  if (isLoading || !data) {
    return DEFAULT_VALUES.org_kpi_employee_self_entry as boolean;
  }

  if (typeof data.setting_value === 'boolean') return data.setting_value;
  if (data.setting_value === 'true') return true;
  return false;
}

/**
 * Get the SLA target in days for query resolution compliance.
 * Default: 2 days.
 */
export function useSlaTargetDays(): number {
  const { data, isLoading } = useWorkflowSetting('query_sla_target_days');

  if (isLoading || !data) {
    return DEFAULT_VALUES.query_sla_target_days as number;
  }

  return typeof data.setting_value === 'number'
    ? data.setting_value
    : parseInt(String(data.setting_value), 10) || 2;
}
