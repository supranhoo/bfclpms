/**
 * Phase 4F — Implementers Audit Log read hook.
 *
 * Owner-only (RLS enforces). Read-only, server-paginated SELECT on
 * `entitlement_audit`. Filters use indexed columns (event_type, entity_type,
 * client_id, actor_id, created_at) and the `reason` text column for the
 * test-email scope — no JSONB scans.
 *
 * Resolves actor + target profile names in one extra IN-query per page.
 */
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type AuditScope =
  | 'grant_role'
  | 'revoke_role'
  | 'assign_client'
  | 'unassign_client'
  | 'test_email_send';

export interface AuditRow {
  id: string;
  created_at: string;
  event_type: string;
  entity_type: string | null;
  entity_key: string | null;
  client_id: string | null;
  actor_id: string | null;
  target_user_id: string | null;
  reason: string | null;
  before: unknown;
  after: unknown;
}

export interface ProfileLite {
  id: string;
  full_name: string | null;
  email: string | null;
  employee_code: string | null;
}

export interface AuditLogParams {
  scopes: AuditScope[];
  actorId?: string | null;
  targetUserId?: string | null;
  clientId?: string | null;
  sinceIso?: string | null;
  untilIso?: string | null;
  page: number; // 1-based
  pageSize: number;
}

const SCOPE_TO_FILTER: Record<
  AuditScope,
  { event_type?: string; entity_type?: string; reason_like?: string }
> = {
  grant_role: { event_type: 'grant_role' },
  revoke_role: { event_type: 'revoke_role' },
  assign_client: { event_type: 'assign_client' },
  unassign_client: { event_type: 'unassign_client' },
  // Phase 3G test sends are written as event_type='update', entity_type='client_smtp',
  // reason starts with 'impl_console_test_email_send_'. Match by reason prefix.
  test_email_send: { entity_type: 'client_smtp', reason_like: 'impl_console_test_email_send_%' },
};

export function useImplementersAuditLog(params: AuditLogParams) {
  return useQuery({
    queryKey: ['impl-audit-log', params],
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    queryFn: async () => {
      const from = (params.page - 1) * params.pageSize;
      const to = from + params.pageSize - 1;

      // Build one query per scope (each may have a distinct event_type/entity_type/reason combo),
      // then union client-side. In practice the user picks ≤5 chips, so ≤5 small queries — cheaper
      // than a single OR over multiple columns and keeps each query index-friendly.
      const scopes = params.scopes.length ? params.scopes : (Object.keys(SCOPE_TO_FILTER) as AuditScope[]);

      type Bucket = { rows: AuditRow[]; count: number };
      const buckets: Bucket[] = await Promise.all(
        scopes.map(async (scope) => {
          const f = SCOPE_TO_FILTER[scope];
          let q = supabase
            .from('entitlement_audit')
            .select(
              'id, created_at, event_type, entity_type, entity_key, client_id, actor_id, target_user_id, reason, before, after',
              { count: 'exact' },
            )
            .order('created_at', { ascending: false })
            .range(from, to);

          if (f.event_type) q = q.eq('event_type', f.event_type);
          if (f.entity_type) q = q.eq('entity_type', f.entity_type);
          if (f.reason_like) q = q.like('reason', f.reason_like);
          if (params.actorId) q = q.eq('actor_id', params.actorId);
          if (params.targetUserId) q = q.eq('target_user_id', params.targetUserId);
          if (params.clientId) q = q.eq('client_id', params.clientId);
          if (params.sinceIso) q = q.gte('created_at', params.sinceIso);
          if (params.untilIso) q = q.lte('created_at', params.untilIso);

          const { data, error, count } = await q;
          if (error) throw error;
          return { rows: (data ?? []) as AuditRow[], count: count ?? 0 };
        }),
      );

      // Merge, re-sort, and slice to page size. Total = sum of per-scope counts.
      const merged = buckets.flatMap((b) => b.rows);
      merged.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      const pageRows = merged.slice(0, params.pageSize);
      const total = buckets.reduce((s, b) => s + b.count, 0);

      // Resolve actor + target profiles for the visible page.
      const ids = new Set<string>();
      pageRows.forEach((r) => {
        if (r.actor_id) ids.add(r.actor_id);
        if (r.target_user_id) ids.add(r.target_user_id);
      });
      let profiles: Map<string, ProfileLite> = new Map();
      if (ids.size > 0) {
        const { data: profRows } = await supabase
          .from('profiles')
          .select('id, full_name, email, employee_code')
          .in('id', Array.from(ids));
        profiles = new Map((profRows ?? []).map((p) => [p.id, p as ProfileLite]));
      }

      // Resolve client display names for visible page (client_id only).
      const clientIds = new Set<string>();
      pageRows.forEach((r) => r.client_id && clientIds.add(r.client_id));
      let clients: Map<string, { id: string; display_name: string; client_key: string }> = new Map();
      if (clientIds.size > 0) {
        const { data: cRows } = await supabase
          .from('clients')
          .select('id, display_name, client_key')
          .in('id', Array.from(clientIds));
        clients = new Map((cRows ?? []).map((c) => [c.id, c]));
      }

      return { rows: pageRows, total, profiles, clients };
    },
  });
}