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
  const directoryCacheRef = useRef<MentionUser[] | null>(null);

  // Pre-fetch accessible user IDs when kpiId changes
  useEffect(() => {
    if (!kpiId) {
      accessibleIdsRef.current = null;
      loadedKpiIdRef.current = undefined;
      directoryCacheRef.current = null;
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
        directoryCacheRef.current = null; // force refetch on next search
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
        // PII hardening (2026-06-22): the broad profile SELECT policies for
        // Org KPI Data Owners / Value Enterers / Incentive Data Entry users
        // were dropped, so direct `profiles` reads return zero rows for those
        // roles — breaking @mention search. When we have a kpiId we already
        // know the accessible user IDs (via RLS-bypassing RPC); fetch their
        // names through the SECURITY DEFINER directory RPC and filter
        // client-side. The directory list per KPI is bounded (typically <200
        // accessible users) so this is cheap and cached per kpiId.
        const accessibleIds = accessibleIdsRef.current;
        if (kpiId && accessibleIds && accessibleIds.length > 0) {
          if (!directoryCacheRef.current) {
            const { data: dir } = await supabase.rpc(
              'get_profile_directory_entries',
              { _ids: accessibleIds }
            );
            directoryCacheRef.current = ((dir || []) as any[]).map(p => ({
              id: p.id,
              full_name: p.full_name ?? null,
              email: '', // email intentionally not exposed via directory RPC
              employee_code: p.employee_code ?? null,
            }));
          }
          const q = query.toLowerCase();
          const filtered = directoryCacheRef.current
            .filter(p =>
              (p.full_name || '').toLowerCase().includes(q) ||
              (p.employee_code || '').toLowerCase().includes(q)
            )
            .slice(0, 8);
          setResults(filtered);
        } else {
          // No kpiId context — fall back to direct profile search (works for
          // admins; non-admins legitimately get empty results in this path).
          const { data, error } = await supabase
            .from('profiles')
            .select('id, full_name, email, employee_code')
            .or(`full_name.ilike.%${query}%,email.ilike.%${query}%`)
            .limit(8);
          if (!error && data) {
            setResults(data as MentionUser[]);
          }
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
