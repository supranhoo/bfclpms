import { useEffect, useMemo, useRef } from 'react';
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
  audits: [
    ['safety', 'audits'],
    ['safety', 'dashboard-stats'],
  ],
  emergency: [
    ['safety', 'emergency'],
    ['safety', 'dashboard-stats'],
  ],
} as const;

type GroupName = keyof typeof KEY_GROUPS;

/**
 * Subscription descriptor table. Each row maps a Postgres table to the
 * cache-key group it should invalidate. The `useSafetyRealtimeSync` hook
 * iterates this once per mount and only attaches the rows whose table
 * appears in the caller's `tables` filter (or all rows when `tables` is
 * undefined — used by the Safety dashboard which needs every table).
 */
type SubscriptionDescriptor = {
  table: SafetyRealtimeTable;
  group: GroupName;
  /** Optional row filter; uses user.id at runtime. */
  filter?: (userId: string) => string;
};

export type SafetyRealtimeTable =
  | 'safety_incidents'
  | 'safety_incident_status_history'
  | 'safety_incident_evidence'
  | 'safety_incident_progress_log'
  | 'safety_notifications'
  | 'safety_sla_escalations'
  | 'safety_permits'
  | 'safety_permit_approvals'
  | 'safety_training_assignments'
  | 'safety_training_attempts'
  | 'safety_assets'
  | 'safety_asset_calibrations'
  | 'safety_asset_evidence'
  | 'safety_audit_runs'
  | 'safety_audit_run_responses'
  | 'safety_audit_templates'
  | 'safety_audit_template_items'
  | 'safety_emergency_drills'
  | 'safety_drill_participants'
  | 'safety_drill_findings'
  | 'safety_emergency_contacts';

const SUBSCRIPTIONS: SubscriptionDescriptor[] = [
  { table: 'safety_incidents', group: 'incidents' },
  { table: 'safety_incident_status_history', group: 'timeline' },
  { table: 'safety_incident_evidence', group: 'evidence' },
  { table: 'safety_incident_progress_log', group: 'progress' },
  {
    table: 'safety_notifications',
    group: 'notifications',
    filter: (userId) => `recipient_id=eq.${userId}`,
  },
  { table: 'safety_sla_escalations', group: 'sla' },
  { table: 'safety_permits', group: 'permits' },
  { table: 'safety_permit_approvals', group: 'permitApprovals' },
  { table: 'safety_training_assignments', group: 'training' },
  { table: 'safety_training_attempts', group: 'training' },
  { table: 'safety_assets', group: 'assets' },
  { table: 'safety_asset_calibrations', group: 'assets' },
  { table: 'safety_asset_evidence', group: 'assets' },
  { table: 'safety_audit_runs', group: 'audits' },
  { table: 'safety_audit_run_responses', group: 'audits' },
  { table: 'safety_audit_templates', group: 'audits' },
  { table: 'safety_audit_template_items', group: 'audits' },
  { table: 'safety_emergency_drills', group: 'emergency' },
  { table: 'safety_drill_participants', group: 'emergency' },
  { table: 'safety_drill_findings', group: 'emergency' },
  { table: 'safety_emergency_contacts', group: 'emergency' },
];

/**
 * Subscribe to Safety realtime updates for the caller-specified tables.
 *
 * @param enabled  Toggle the whole subscription off (e.g. role gating).
 * @param tables   Optional whitelist. When omitted, subscribes to ALL
 *                 20 Safety tables — reserved for the Safety dashboard.
 *                 List pages should pass only the tables they render to
 *                 avoid paying for cross-module realtime events.
 */
export function useSafetyRealtimeSync(
  enabled: boolean = true,
  tables?: ReadonlyArray<SafetyRealtimeTable>,
) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Set<GroupName>>(new Set());

  // Stable signature for the dependency array so the effect doesn't tear
  // down on every render when callers pass an inline array literal.
  const tablesKey = useMemo(
    () => (tables ? [...tables].sort().join(',') : '*'),
    [tables],
  );

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

    const wanted = tables ? new Set<string>(tables) : null;
    const subs = wanted
      ? SUBSCRIPTIONS.filter((s) => wanted.has(s.table))
      : SUBSCRIPTIONS;
    // Channel name differentiates dashboard (full set) from per-page
    // scoped subscriptions so Supabase Realtime tracks them separately.
    const channelName = wanted
      ? `safety-realtime-${user.id}-${tablesKey}`
      : `safety-realtime-sync-${user.id}`;
    let chan = supabase.channel(channelName);
    for (const s of subs) {
      const cfg: { event: '*'; schema: 'public'; table: string; filter?: string } = {
        event: '*',
        schema: 'public',
        table: s.table,
      };
      if (s.filter) cfg.filter = s.filter(user.id);
      chan = chan.on('postgres_changes', cfg, () => schedule(s.group));
    }
    const channel = chan.subscribe();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      pendingRef.current.clear();
      supabase.removeChannel(channel);
    };
  }, [enabled, user?.id, qc, tablesKey]);
}
