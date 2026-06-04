/**
 * Phase 4F — Implementers Audit Log read hook.
 *
 * Owner-only (RLS enforces). Read-only, server-paginated SELECT on
 * `entitlement_audit`. Filters exclusively on indexed columns
 * (event_type, entity_type, client_id, actor_id, created_at) and the
 * indexed `reason` text column. No JSONB scans.
 *
 * IMPORTANT — actual event shapes written by manage-implementer:
 *   grant role         → event_type='grant',  entity_type='implementation_admin_role',     reason='impl_console_grant_role'
 *   revoke role        → event_type='revoke', entity_type='implementation_admin_role',     reason='impl_console_revoke_role'
 *   assign client      → event_type='grant',  entity_type='client_implementer_assignment', reason='impl_console_assign_client'
 *   unassign client    → event_type='revoke', entity_type='client_implementer_assignment', reason='impl_console_unassign_client'
 *   test email send    → event_type='update', entity_type='client_smtp',                   reason LIKE 'impl_console_test_email_send_%'
 *
 * The `entitlement_audit` table has NO `target_user_id` column — target
 * user is encoded in `after.user_id` (assignments/role grants) or
 * `before.user_id` (role revokes). We resolve at render time.
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
  clientId?: string | null;
  sinceIso?: string | null;
  untilIso?: string | null;
  page: number; // 1-based
  pageSize: number;
}

/** Reasons we filter on — every implementer-relevant write uses one of these. */
const SCOPE_TO_REASON: Record<AuditScope, { kind: 'exact' | 'like'; value: string }> = {
  grant_role: { kind: 'exact', value: 'impl_console_grant_role' },
  revoke_role: { kind: 'exact', value: 'impl_console_revoke_role' },
  assign_client: { kind: 'exact', value: 'impl_console_assign_client' },
  unassign_client: { kind: 'exact', value: 'impl_console_unassign_client' },
  test_email_send: { kind: 'like', value: 'impl_console_test_email_send_%' },
};

export function useImplementersAuditLog(params: AuditLogParams) {
  return useQuery({
    queryKey: ['impl-audit-log', params],
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    queryFn: async () => {
      const from = (params.page - 1) * params.pageSize;
      const to = from + params.pageSize - 1;

      // Default to all scopes when none selected.
      const scopes: AuditScope[] = params.scopes.length
        ? params.scopes
        : (Object.keys(SCOPE_TO_REASON) as AuditScope[]);

      // Split into exact-match reasons (cheap .in()) and like-match reasons (separate queries).
      const exactReasons = scopes
        .filter((s) => SCOPE_TO_REASON[s].kind === 'exact')
        .map((s) => SCOPE_TO_REASON[s].value);
      const likeReasons = scopes
        .filter((s) => SCOPE_TO_REASON[s].kind === 'like')
        .map((s) => SCOPE_TO_REASON[s].value);

      type Bucket = { rows: AuditRow[]; count: number };

      // Use `any` on builder to avoid the Supabase deep-instantiation TS error
      // (the chain of conditional .eq/.gte calls otherwise blows the type depth).
      const applyCommon = (builder: any) => {
        let q = builder;
        if (params.actorId) q = q.eq('actor_id', params.actorId);
        if (params.clientId) q = q.eq('client_id', params.clientId);
        if (params.sinceIso) q = q.gte('created_at', params.sinceIso);
        if (params.untilIso) q = q.lte('created_at', params.untilIso);
        return q;
      };

      const queries: Promise<Bucket>[] = [];

      if (exactReasons.length) {
        const base = (supabase
          .from('entitlement_audit')
          .select(
            'id, created_at, event_type, entity_type, entity_key, client_id, actor_id, reason, before, after',
            { count: 'exact' },
          ) as any)
          .in('reason', exactReasons)
          .order('created_at', { ascending: false })
          .range(from, to);
        queries.push(
          applyCommon(base).then(({ data, error, count }: any) => {
            if (error) throw error;
            return { rows: (data ?? []) as AuditRow[], count: count ?? 0 };
          }),
        );
      }

      for (const pattern of likeReasons) {
        const base = (supabase
          .from('entitlement_audit')
          .select(
            'id, created_at, event_type, entity_type, entity_key, client_id, actor_id, reason, before, after',
            { count: 'exact' },
          ) as any)
          .like('reason', pattern)
          .order('created_at', { ascending: false })
          .range(from, to);
        queries.push(
          applyCommon(base).then(({ data, error, count }: any) => {
            if (error) throw error;
            return { rows: (data ?? []) as AuditRow[], count: count ?? 0 };
          }),
        );
      }

      const buckets = await Promise.all(queries);
      const merged = buckets.flatMap((b) => b.rows);
      merged.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      const pageRows = merged.slice(0, params.pageSize);
      const total = buckets.reduce((s, b) => s + b.count, 0);

      // Resolve actor + target profile names. Target is buried in JSON payloads.
      const userIds = new Set<string>();
      pageRows.forEach((r) => {
        if (r.actor_id) userIds.add(r.actor_id);
        const after = (r.after ?? {}) as Record<string, unknown>;
        const before = (r.before ?? {}) as Record<string, unknown>;
        const tgt = (after.user_id ?? before.user_id) as string | undefined;
        if (tgt && typeof tgt === 'string') userIds.add(tgt);
      });

      let profiles: Map<string, ProfileLite> = new Map();
      if (userIds.size > 0) {
        const { data: profRows } = await supabase
          .from('profiles')
          .select('id, full_name, email, employee_code')
          .in('id', Array.from(userIds));
        profiles = new Map((profRows ?? []).map((p: any) => [p.id, p as ProfileLite]));
      }

      const clientIds = new Set<string>();
      pageRows.forEach((r) => r.client_id && clientIds.add(r.client_id));
      let clients: Map<string, { id: string; display_name: string; client_key: string }> = new Map();
      if (clientIds.size > 0) {
        const { data: cRows } = await supabase
          .from('clients')
          .select('id, display_name, client_key')
          .in('id', Array.from(clientIds));
        clients = new Map((cRows ?? []).map((c: any) => [c.id, c]));
      }

      return { rows: pageRows, total, profiles, clients };
    },
  });
}

/** Extract the target user_id from an audit row's JSON payloads. */
export function extractTargetUserId(row: AuditRow): string | null {
  const after = (row.after ?? {}) as Record<string, unknown>;
  const before = (row.before ?? {}) as Record<string, unknown>;
  const v = (after.user_id ?? before.user_id) as unknown;
  return typeof v === 'string' ? v : null;
}