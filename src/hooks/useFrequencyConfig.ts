import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { WEEKLY_REVIEW_WINDOWS, WeeklyReviewWindow } from '@/lib/frequencyUtils';

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

/**
 * Resolve Weekly review windows from the DB config row, normalised to the
 * in-memory `WeeklyReviewWindow` shape (camelCase `nextMonth`).
 * Falls back to the hardcoded `WEEKLY_REVIEW_WINDOWS` defaults if the row
 * is missing or malformed so existing screens never break.
 *
 * POLICY §Weekly Review Windows — admin-configurable per tenant.
 */
export function useWeeklyReviewWindowsResolved(): Record<string, WeeklyReviewWindow> {
  const raw = useWeeklyReviewWindows();
  if (!raw || typeof raw !== 'object') return WEEKLY_REVIEW_WINDOWS;

  const out: Record<string, WeeklyReviewWindow> = {};
  for (const [key, val] of Object.entries(raw as Record<string, any>)) {
    if (!val || typeof val !== 'object') continue;
    const start = Number(val.start);
    const end = Number(val.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    const nextMonth = val.nextMonth === true || val.next_month === true;
    out[key] = nextMonth ? { start, end, nextMonth: true } : { start, end };
  }
  return Object.keys(out).length > 0 ? out : WEEKLY_REVIEW_WINDOWS;
}

/**
 * Mutation to update only the Weekly row's review_window_rules JSONB.
 * Persists camelCase `nextMonth` as snake_case `next_month` for DB consistency.
 */
export function useUpdateWeeklyReviewWindows() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (windows: Record<string, WeeklyReviewWindow>) => {
      const dbShape: Record<string, { start: number; end: number; next_month?: boolean }> = {};
      for (const [k, w] of Object.entries(windows)) {
        dbShape[k] = w.nextMonth ? { start: w.start, end: w.end, next_month: true } : { start: w.start, end: w.end };
      }
      const { error } = await supabase
        .from('frequency_config')
        .update({ review_window_rules: dbShape as any })
        .eq('frequency', 'Weekly');
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['frequency-configs'] });
    },
  });
}

/**
 * Mutation hook to update a frequency config row
 */
export function useUpdateFrequencyConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      id: string;
      sub_frequency: string;
      locked_months: Record<string, number[]>;
      active_month: number;
    }) => {
      const { error } = await supabase
        .from('frequency_config')
        .update({
          sub_frequency: params.sub_frequency,
          locked_months: params.locked_months,
          active_month: params.active_month,
        })
        .eq('id', params.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['frequency-configs'] });
    },
  });
}
