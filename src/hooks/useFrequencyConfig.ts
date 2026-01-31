import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface FrequencyConfig {
  id: string;
  frequency: string;
  sub_frequency: string;
  review_window_rules: Record<string, any> | null;
  locked_months: Record<string, number[]> | null;
  active_month: number | null;
  description: string | null;
  created_at: string;
}

/**
 * Fetch all frequency configurations
 */
export function useFrequencyConfigs() {
  return useQuery({
    queryKey: ['frequency-configs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('frequency_config')
        .select('*')
        .order('frequency');
      
      if (error) throw error;
      return data as FrequencyConfig[];
    },
  });
}

/**
 * Fetch a specific frequency configuration
 */
export function useFrequencyConfig(frequency: string | null | undefined) {
  const { data: configs } = useFrequencyConfigs();
  
  return {
    config: configs?.find(c => c.frequency === frequency) || null,
    isLoading: !configs,
  };
}

/**
 * Get weekly review windows from config
 */
export function useWeeklyReviewWindows() {
  const { config } = useFrequencyConfig('Weekly');
  
  return config?.review_window_rules || null;
}
