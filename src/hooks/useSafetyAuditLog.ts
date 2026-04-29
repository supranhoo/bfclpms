import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * useSafetyAuditLog
 * -----------------
 * Read-only access to the safety_audit_log surface. RLS already restricts
 * SELECT to safety admins (see migration). We do a separate profile lookup
 * for performer names so we don't rely on PostgREST FK joins (which the
 * audit table does not declare).
 */

export interface SafetyAuditEntry {
  id: string;
  event_type: string;
  entity_type: string;
  entity_id: string | null;
  performed_by: string | null;
  performed_by_name?: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export interface SafetyAuditFilters {
  entityType?: string;
  eventType?: string;
  search?: string;
  limit?: number;
}

export function useSafetyAuditLog(filters: SafetyAuditFilters = {}) {
  return useQuery({
    queryKey: ['safety', 'audit-log', filters],
    queryFn: async (): Promise<SafetyAuditEntry[]> => {
      let q = supabase
        .from('safety_audit_log')
        .select('id, event_type, entity_type, entity_id, performed_by, details, created_at')
        .order('created_at', { ascending: false })
        .limit(filters.limit ?? 200);

      if (filters.entityType) q = q.eq('entity_type', filters.entityType);
      if (filters.eventType) q = q.eq('event_type', filters.eventType);

      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as SafetyAuditEntry[];

      // Resolve performer names in a single batched query.
      const performerIds = Array.from(
        new Set(rows.map((r) => r.performed_by).filter((id): id is string => !!id)),
      );
      let nameMap = new Map<string, string>();
      if (performerIds.length) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', performerIds);
        nameMap = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name as string]));
      }

      const enriched = rows.map((r) => ({
        ...r,
        performed_by_name: r.performed_by ? nameMap.get(r.performed_by) ?? null : null,
      }));

      // Optional client-side search across event_type / entity_type / performer name / details.
      if (filters.search?.trim()) {
        const needle = filters.search.toLowerCase();
        return enriched.filter((r) => {
          const hay =
            `${r.event_type} ${r.entity_type} ${r.performed_by_name ?? ''} ${JSON.stringify(r.details)}`.toLowerCase();
          return hay.includes(needle);
        });
      }
      return enriched;
    },
    staleTime: 30_000,
  });
}
