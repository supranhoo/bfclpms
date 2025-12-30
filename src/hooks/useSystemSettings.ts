import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type ScoreCalculationMode = 'manual' | 'auto_calculate' | 'suggested_override';

interface SystemSetting {
  id: string;
  setting_key: string;
  setting_value: string | number | boolean | object;
  description: string | null;
  created_at: string;
  updated_at: string;
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
        .single();
      
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

export function useUpdateSystemSetting() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      // Store the value directly as a JSON string
      const { data, error } = await supabase
        .from('system_settings')
        .update({ setting_value: JSON.parse(JSON.stringify(value)) })
        .eq('setting_key', key)
        .select()
        .single();
      
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
