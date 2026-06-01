import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useSystemSetting } from '@/hooks/useSystemSettings';

/**
 * Dummy/System Employee Visibility hook.
 *
 * Reads the two global toggles (default OFF — hide dummies) and the small set
 * of profile IDs flagged `is_dummy_employee = true`. Returns helpers consumed
 * by selectors, lists, and Excel export call sites.
 *
 * • `showInFrontend` — true when admins explicitly allow dummies in business UI
 * • `showInExcel`    — true when admins explicitly allow dummies in exports
 * • `dummyIds`       — Set<string> of profile IDs currently marked as dummy
 * • `isDummy(id)`    — convenience predicate
 *
 * The dummy-id query is auth-gated and cached (5 min stale). Defaults to a
 * safe "no" while loading so we never accidentally include dummies in
 * exports during a slow fetch.
 *
 * See POLICY: "Dummy/System Employee Visibility".
 */
function readYesNo(value: unknown, fallback = false): boolean {
  if (typeof value === 'string') {
    return value.replace(/^"|"$/g, '').toLowerCase() === 'yes';
  }
  return fallback;
}

export function useDummyEmployees() {
  const { user, isReady } = useAuth();
  const { data: excelSetting, isLoading: lExcel } = useSystemSetting('show_dummy_in_excel');
  const { data: frontSetting, isLoading: lFront } = useSystemSetting('show_dummy_in_frontend');

  const dummyQuery = useQuery({
    queryKey: ['dummy-employee-ids'],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('is_dummy_employee', true);
      if (error) throw error;
      return (data ?? []).map((r: any) => r.id as string);
    },
    enabled: isReady && !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  const dummyIds = useMemo<Set<string>>(
    () => new Set(dummyQuery.data ?? []),
    [dummyQuery.data],
  );

  const showInExcel = readYesNo(excelSetting?.setting_value);
  const showInFrontend = readYesNo(frontSetting?.setting_value);

  return {
    showInExcel,
    showInFrontend,
    dummyIds,
    isDummy: (id: string | null | undefined) =>
      !!id && dummyIds.has(id),
    isLoading: lExcel || lFront || dummyQuery.isLoading,
  };
}