import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * useSafetySettings
 * -----------------
 * Read/write hooks for `public.safety_settings`. Reads are cached under
 * the `['safety','settings']` prefix and never bleed into PMS caches.
 */

export type SafetySettingRow = {
  key: string;
  value: unknown;
  description: string | null;
  updated_at: string;
  updated_by: string | null;
};

const KEY = ['safety', 'settings'] as const;

export function useSafetySettings() {
  return useQuery<SafetySettingRow[]>({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('safety_settings')
        .select('*')
        .order('key');
      if (error) throw error;
      return (data ?? []) as SafetySettingRow[];
    },
    staleTime: 30_000,
  });
}

export function useUpsertSafetySetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { key: string; value: unknown; description?: string | null }) => {
      const { data, error } = await (supabase.rpc as unknown as (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>)(
        'set_safety_setting',
        {
          p_key: input.key,
          p_value: input.value,
          p_description: input.description ?? null,
        },
      );
      if (error) throw error;
      const r = data as { ok: boolean; error?: string };
      if (!r?.ok) throw new Error(r?.error ?? 'set_safety_setting failed');
      return r;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}