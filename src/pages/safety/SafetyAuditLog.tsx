import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useManualQuery, type ManualQueryFetcherArgs } from '@/hooks/useManualQuery';
import { SafetyFilterBar } from '@/components/safety/SafetyFilterBar';
import { SafetyDataTable } from '@/components/safety/SafetyDataTable';
import { format } from 'date-fns';

/**
 * Safety Audit Log
 * ----------------
 * POLICY §113 / ADR-050 — filters-first, click-to-load, server-paginated.
 * Read-only compliance surface (RLS-restricted to safety admins).
 */

const ENTITY_OPTIONS = ['all', 'safety_incident', 'safety_user_role', 'safety_module_access'];
const EVENT_OPTIONS = [
  'all',
  'incident_created',
  'incident_status_changed',
  'incident_assigned',
  'incident_closed',
  'role_granted',
  'role_revoked',
  'module_access_granted',
  'module_access_revoked',
];

interface AuditFilters {
  entityType: string;
  eventType: string;
  search: string;
}

interface AuditRow {
  id: string;
  event_type: string;
  entity_type: string;
  entity_id: string | null;
  performed_by: string | null;
  performed_by_name: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

async function fetchAuditPage({
  filters, range,
}: ManualQueryFetcherArgs<AuditFilters>) {
  let q = supabase
    .from('safety_audit_log')
    .select('id, event_type, entity_type, entity_id, performed_by, details, created_at', {
      count: 'exact',
    })
    .order('created_at', { ascending: false })
    .range(range[0], range[1]);

  if (filters.entityType !== 'all') q = q.eq('entity_type', filters.entityType);
  if (filters.eventType !== 'all') q = q.eq('event_type', filters.eventType);
  if (filters.search.trim()) {
    const needle = filters.search.trim();
    // Server-side text search across performer + details JSON cast to text.
    q = q.or(
      `event_type.ilike.%${needle}%,entity_type.ilike.%${needle}%,details::text.ilike.%${needle}%`,
    );
  }

  const { data, error, count } = await q;
  if (error) throw error;
  const baseRows = (data ?? []) as Omit<AuditRow, 'performed_by_name'>[];

  // Resolve performer names for the current page only.
  const performerIds = Array.from(
    new Set(baseRows.map((r) => r.performed_by).filter((id): id is string => !!id)),
  );
  let nameMap = new Map<string, string>();
  if (performerIds.length) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', performerIds);
    nameMap = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name as string]));
  }
  const rows: AuditRow[] = baseRows.map((r) => ({
    ...r,
    performed_by_name: r.performed_by ? nameMap.get(r.performed_by) ?? null : null,
  }));

  return { rows, total: count ?? rows.length };
}

const INITIAL: AuditFilters = { entityType: 'all', eventType: 'all', search: '' };

export default function SafetyAuditLog() {
  const [draft, setDraft] = useState<AuditFilters>(INITIAL);

  const {
    rows, total, page, pageSize, totalPages,
    hasSubmitted, isLoading, isFetching,
    submit, reset, setPage, setPageSize,
  } = useManualQuery<AuditRow, AuditFilters>(['safety', 'audit-log'], fetchAuditPage);

  const handleSubmit = () => submit(draft);
  const handleReset = () => {
    setDraft(INITIAL);
    reset();
  };

  return (
    <div className="w-full space-y-6">
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-xl bg-destructive/10 text-destructive">
          <ScrollText className="h-7 w-7" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Safety Audit Log</h1>
          <p className="text-muted-foreground">
            Immutable trail of every Safety mutation — incidents, role grants, access changes.
          </p>
        </div>
      </div>

      <SafetyFilterBar
        onSubmit={handleSubmit}
        onReset={handleReset}
        isSubmitting={isFetching}
      >
        <Select value={draft.entityType} onValueChange={(v) => setDraft((d) => ({ ...d, entityType: v }))}>
          <SelectTrigger><SelectValue placeholder="Entity type" /></SelectTrigger>
          <SelectContent>
            {ENTITY_OPTIONS.map((o) => (
              <SelectItem key={o} value={o}>{o === 'all' ? 'All entities' : o}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={draft.eventType} onValueChange={(v) => setDraft((d) => ({ ...d, eventType: v }))}>
          <SelectTrigger><SelectValue placeholder="Event type" /></SelectTrigger>
          <SelectContent>
            {EVENT_OPTIONS.map((o) => (
              <SelectItem key={o} value={o}>{o === 'all' ? 'All events' : o}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="Search performer / details…"
          value={draft.search}
          onChange={(e) => setDraft((d) => ({ ...d, search: e.target.value }))}
        />
      </SafetyFilterBar>

      <SafetyDataTable
        title="Audit entries"
        hasSubmitted={hasSubmitted}
        isLoading={isLoading}
        rowCount={rows.length}
        total={total}
        page={page}
        pageSize={pageSize}
        totalPages={totalPages}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">When</TableHead>
              <TableHead>Event</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Performer</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {format(new Date(r.created_at), 'dd MMM yyyy HH:mm')}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="font-mono text-[11px]">{r.event_type}</Badge>
                </TableCell>
                <TableCell className="text-xs">
                  <div className="font-medium">{r.entity_type}</div>
                  {r.entity_id && (
                    <div className="font-mono text-[10px] text-muted-foreground truncate max-w-[180px]">
                      {r.entity_id}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-sm">
                  {r.performed_by_name ?? (
                    <span className="text-muted-foreground italic">System</span>
                  )}
                </TableCell>
                <TableCell className="max-w-[420px]">
                  <pre className="text-[11px] text-muted-foreground whitespace-pre-wrap break-words bg-muted/40 rounded p-2 max-h-32 overflow-auto">
{JSON.stringify(r.details, null, 2)}
                  </pre>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SafetyDataTable>
    </div>
  );
}
