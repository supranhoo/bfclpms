import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface MentionUser {
  id: string;
  full_name: string | null;
  email: string;
  employee_code: string | null;
}

/**
 * Search for users to @mention.
 * When kpiId is provided, results are filtered to users who already have
 * RLS access to that KPI (employee, manager, skip-level, admins, auditors,
 * HR PMS, management, data owners, and existing mention-access holders).
 */
export function useMentionSearch(query: string, kpiId?: string) {
  const [results, setResults] = useState<MentionUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const accessibleIdsRef = useRef<string[] | null>(null);
  const loadedKpiIdRef = useRef<string | undefined>(undefined);

  // Pre-fetch accessible user IDs when kpiId changes
  useEffect(() => {
    if (!kpiId) {
      accessibleIdsRef.current = null;
      loadedKpiIdRef.current = undefined;
      return;
    }
    if (loadedKpiIdRef.current === kpiId) return;

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc('get_kpi_accessible_user_ids', {
        p_kpi_id: kpiId,
      });
      if (!cancelled && !error && data) {
        accessibleIdsRef.current = data as string[];
        loadedKpiIdRef.current = kpiId;
      }
    })();

    return () => { cancelled = true; };
  }, [kpiId]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query || query.length < 1) {
      setResults([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        let dbQuery = supabase
          .from('profiles')
          .select('id, full_name, email, employee_code')
          .or(`full_name.ilike.%${query}%,email.ilike.%${query}%`);

        // Filter to accessible users if we have the list
        if (kpiId && accessibleIdsRef.current && accessibleIdsRef.current.length > 0) {
          dbQuery = dbQuery.in('id', accessibleIdsRef.current);
        }

        const { data, error } = await dbQuery.limit(8);

        if (!error && data) {
          setResults(data as MentionUser[]);
        }
      } catch {
        // ignore
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, kpiId]);

  return { results, isLoading };
}
