import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const KPI_QUERY_KEYS = [
  'kpis', 'my-kpis', 'all-kpis', 'kpis-by-period', 'admin-kpis',
  'kpi-timeline', 'kpi-journey-audit-logs', 'kpi-observations',
];

const SUBMISSION_QUERY_KEYS = [
  'review-submissions', 'review-submission-admin', 'review-submission',
];

const ORG_KPI_QUERY_KEYS = [
  'org-kpi-values', 'org-kpi-value',
];

// Increased from 500ms to 1500ms to coalesce bursts of DB events into a
// single round of cache invalidations (was causing cascading refetches
// during periods of heavy review activity).
const DEBOUNCE_MS = 1500;

export function useRealtimeKpiSync(enabled: boolean = true) {
  const queryClient = useQueryClient();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) return;

    function scheduleInvalidation(keys: string[]) {
      keys.forEach((k) => pendingKeysRef.current.add(k));

      if (timerRef.current) clearTimeout(timerRef.current);

      timerRef.current = setTimeout(() => {
        const toInvalidate = Array.from(pendingKeysRef.current);
        pendingKeysRef.current.clear();
        toInvalidate.forEach((key) => {
          queryClient.invalidateQueries({ queryKey: [key] });
        });
      }, DEBOUNCE_MS);
    }

    const channel = supabase
      .channel('realtime-kpi-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'kpis' },
        () => scheduleInvalidation(KPI_QUERY_KEYS)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'review_submissions' },
        () => scheduleInvalidation([...SUBMISSION_QUERY_KEYS, ...KPI_QUERY_KEYS])
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'org_kpi_values' },
        () => scheduleInvalidation(ORG_KPI_QUERY_KEYS)
      )
      .subscribe();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      supabase.removeChannel(channel);
    };
  }, [queryClient, enabled]);
}
