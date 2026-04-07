import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

import type { DailyAggregationMethod } from '@/lib/dailyAggregation';

export type ScoreCalculationMode = 'manual' | 'auto_calculate' | 'suggested_override';
export type { DailyAggregationMethod };

interface SystemSetting {
  id: string;
  setting_key: string;
  setting_value: string | number | boolean | object;
  description: string | null;
  created_at: string;
  updated_at: string;
}

interface RolloverLog {
  id: string;
  source_period: string;
  source_year: number;
  target_period: string;
  target_year: number;
  kpis_copied: number;
  employees_affected: number;
  triggered_by: string;
  status: string;
  error_message: string | null;
  created_at: string;
}

export function useSystemSettings() {
  return useQuery({
    queryKey: ['system-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_settings')
        .select('*');
      
      if (error) throw error;
      return data as SystemSetting[];
    },
  });
}

export function useSystemSetting(key: string) {
  return useQuery({
    queryKey: ['system-settings', key],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_settings')
        .select('*')
        .eq('setting_key', key)
        .maybeSingle();
      
      if (error) throw error;
      return data as SystemSetting;
    },
  });
}

export function useScoreCalculationMode() {
  const { data, isLoading } = useSystemSetting('score_calculation_mode');
  
  // Parse the setting value - it might be stored as a JSON string
  let mode: ScoreCalculationMode = 'manual';
  if (data?.setting_value) {
    const value = data.setting_value;
    // Handle both direct string and JSON-encoded string
    if (typeof value === 'string') {
      // Remove quotes if it's a JSON string like '"auto_calculate"'
      mode = value.replace(/^"|"$/g, '') as ScoreCalculationMode;
    }
  }
  
  return { mode, isLoading };
}

export function useAutoRolloverSetting() {
  const { data, isLoading } = useSystemSetting('auto_kra_rollover');
  
  let enabled = true; // Default to enabled
  if (data?.setting_value) {
    const value = data.setting_value;
    if (typeof value === 'string') {
      enabled = value.replace(/^"|"$/g, '') === 'enabled';
    }
  }
  
  return { enabled, isLoading };
}

export function useDailyAggregationMethod() {
  const { data, isLoading } = useSystemSetting('daily_aggregation_method');
  
  let method: DailyAggregationMethod = 'average'; // Default to average
  if (data?.setting_value) {
    const value = data.setting_value;
    if (typeof value === 'string') {
      const parsed = value.replace(/^"|"$/g, '') as DailyAggregationMethod;
      if (parsed === 'average' || parsed === 'missed_days_penalty') {
        method = parsed;
      }
    }
  }
  
  return { method, isLoading };
}

export function useAutoLogoutMinutes() {
  const { data, isLoading } = useSystemSetting('auto_logout_minutes');
  
  let minutes = 30; // Default 30 minutes
  if (data?.setting_value) {
    const value = data.setting_value;
    if (typeof value === 'number') {
      minutes = value;
    } else if (typeof value === 'string') {
      const parsed = parseInt(value.replace(/^"|"$/g, ''), 10);
      if (!isNaN(parsed)) {
        minutes = parsed;
      }
      // "disabled" or "0" means no auto-logout
      if (value.replace(/^"|"$/g, '').toLowerCase() === 'disabled') {
        minutes = 0;
      }
    }
  }
  
  return { minutes, isLoading };
}

export function useWorkingDaysPerMonth() {
  const { data, isLoading } = useSystemSetting('working_days_per_month');
  
  // Default to 22 working days per month
  let days = 22;
  if (data?.setting_value) {
    const value = data.setting_value;
    if (typeof value === 'number') {
      days = value;
    } else if (typeof value === 'string') {
      const parsed = parseInt(value.replace(/^"|"$/g, ''), 10);
      if (!isNaN(parsed)) {
        days = parsed;
      }
    }
  }
  
  return days;
}

export function useRolloverLogs() {
  return useQuery({
    queryKey: ['rollover-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kra_rollover_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (error) throw error;
      return data as RolloverLog[];
    },
  });
}

export function useTriggerRollover() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (force: boolean = false) => {
      const { data, error } = await supabase.functions.invoke('auto-rollover-kpis', {
        body: { triggered_by: 'admin_manual', force },
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['rollover-logs'] });
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      
      if (data.skipped) {
        toast({
          title: 'Rollover Skipped',
          description: data.reason,
        });
      } else {
        toast({
          title: 'Rollover Complete',
          description: `Copied ${data.kpis_copied} KPIs for ${data.employees_affected} employees.`,
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Rollover Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useUpdateSystemSetting() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      // Use upsert so missing keys are created automatically
      const { data, error } = await supabase
        .from('system_settings')
        .upsert(
          { setting_key: key, setting_value: JSON.parse(JSON.stringify(value)) },
          { onConflict: 'setting_key' }
        )
        .select()
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['system-settings'] });
      queryClient.invalidateQueries({ queryKey: ['system-settings', variables.key] });
      toast({
        title: 'Setting Updated',
        description: 'The system setting has been saved successfully.',
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
