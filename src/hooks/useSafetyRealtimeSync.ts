import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Phase 1.G — Safety realtime sync.
 *
 * Mirrors the PMS `useRealtimeKpiSync` pattern but is strictly scoped to
 * Safety tables and Safety cache keys. Subscribes once per Safety shell
 * mount and debounces bursts of DB events into a single round of cache
 * invalidations under the `['safety', ...]` prefix.
 *
 * Channels:
 *  - `safety_incidents`           → invalidates incidents/dashboard/audit
 *  - `safety_incident_status_history` → timeline + dashboard
 *  - `safety_incident_evidence`   → detail/timeline
 *  - `safety_incident_progress_log` → detail/timeline
 *  - `safety_notifications`       → bell (filtered by recipient_id)
 *  - `safety_sla_escalations`     → SLA monitor + dashboard
 *
 * Per POLICY §110 (cache isolation) this hook NEVER invalidates non-safety
 * cache keys and NEVER calls a global `invalidateQueries()`.
 */

const DEBOUNCE_MS = 1500;

const KEY_GROUPS = {
  incidents: [
    ['safety', 'incidents'],
    ['safety', 'incident'],
    ['safety', 'dashboard-stats'],
    ['safety', 'audit-log'],
  ],
  timeline: [
    ['safety', 'incident'],
    ['safety', 'incident-detail'],
    ['safety', 'dashboard-stats'],
  ],
  evidence: [
    ['safety', 'incident'],
    ['safety', 'incident-detail'],
  ],
  progress: [
    ['safety', 'incident'],
    ['safety', 'incident-detail'],
  ],
  notifications: [
    ['safety', 'notifications'],
  ],
  sla: [
    ['safety', 'sla-escalations'],
    ['safety', 'dashboard-stats'],
    ['safety', 'incidents'],
  ],
  permits: [
    ['safety', 'permits'],
    ['safety', 'dashboard-stats'],
  ],
  permitApprovals: [
    ['safety', 'permits'],
  ],
  training: [
    ['safety', 'training'],
    ['safety', 'dashboard-stats'],
  ],
  assets: [
    ['safety', 'assets'],
    ['safety', 'asset'],
    ['safety', 'asset-calibrations'],
    ['safety', 'asset-evidence'],
    ['safety', 'dashboard-stats'],
  ],
} as const;

type GroupName = keyof typeof KEY_GROUPS;

export function useSafetyRealtimeSync(enabled: boolean = true) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Set<GroupName>>(new Set());

  useEffect(() => {
    if (!enabled || !user?.id) return;

    function schedule(group: GroupName) {
      pendingRef.current.add(group);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const groups = Array.from(pendingRef.current);
        pendingRef.current.clear();
        const seen = new Set<string>();
        for (const g of groups) {
          for (const key of KEY_GROUPS[g]) {
            const sig = key.join('|');
            if (seen.has(sig)) continue;
            seen.add(sig);
            qc.invalidateQueries({ queryKey: key as unknown as readonly unknown[] });
          }
        }
      }, DEBOUNCE_MS);
    }

    const channel = supabase
      .channel(`safety-realtime-sync-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'safety_incidents' },
        () => schedule('incidents'),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'safety_incident_status_history' },
        () => schedule('timeline'),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'safety_incident_evidence' },
        () => schedule('evidence'),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'safety_incident_progress_log' },
        () => schedule('progress'),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'safety_notifications',
          filter: `recipient_id=eq.${user.id}`,
        },
        () => schedule('notifications'),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'safety_sla_escalations' },
        () => schedule('sla'),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'safety_permits' },
        () => schedule('permits'),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'safety_permit_approvals' },
        () => schedule('permitApprovals'),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'safety_training_assignments' },
        () => schedule('training'),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'safety_training_attempts' },
        () => schedule('training'),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'safety_assets' },
        () => schedule('assets'),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'safety_asset_calibrations' },
        () => schedule('assets'),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'safety_asset_evidence' },
        () => schedule('assets'),
      )
      .subscribe();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      pendingRef.current.clear();
      supabase.removeChannel(channel);
    };
  }, [enabled, user?.id, qc]);
}
