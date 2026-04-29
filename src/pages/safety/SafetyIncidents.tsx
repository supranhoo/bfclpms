import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { AlertTriangle, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useManualQuery, type ManualQueryFetcherArgs } from '@/hooks/useManualQuery';
import { SafetyFilterBar } from '@/components/safety/SafetyFilterBar';
import { SafetyDataTable } from '@/components/safety/SafetyDataTable';
import { SafetyStatusBadge } from '@/components/safety/StatusBadge';
import { SlaBadge } from '@/components/safety/SlaBadge';
import {
  SAFETY_SEVERITY_LABELS,
  SAFETY_TYPE_LABELS,
} from '@/lib/safetyIncidents';
import type { SafetyIncidentRow } from '@/hooks/useSafetyIncidents';
import { format } from 'date-fns';

/**
 * Safety Incidents — POLICY §113 / ADR-050.
 * Filters first, click Search to load, paginated server-side.
 */

const STATUS_OPTIONS = [
  'all', 'reported', 'assigned', 'investigation', 'rca',
  'corrective_action', 'verification', 'closed', 'orphaned',
] as const;
const SEVERITY_OPTIONS = ['all', 'low', 'medium', 'high', 'critical'] as const;
const TYPE_OPTIONS = [
  'all', 'near_miss', 'first_aid', 'medical_treatment', 'lost_time',
  'fatality', 'property_damage', 'environmental', 'other',
] as const;

interface IncidentFilters {
  status: string;
  severity: string;
  type: string;
  search: string;
}

const INITIAL: IncidentFilters = { status: 'all', severity: 'all', type: 'all', search: '' };

async function fetchIncidentsPage({
  filters, range,
}: ManualQueryFetcherArgs<IncidentFilters>): Promise<{ rows: SafetyIncidentRow[]; total: number }> {
  let q = supabase
    .from('safety_incidents_with_sla' as never)
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(range[0], range[1]);

  if (filters.status !== 'all') q = q.eq('status', filters.status);
  if (filters.severity !== 'all') q = q.eq('severity', filters.severity);
  if (filters.type !== 'all') q = q.eq('incident_type', filters.type);
  if (filters.search.trim()) {
    const needle = filters.search.trim();
    q = q.or(
      `title.ilike.%${needle}%,location.ilike.%${needle}%,incident_number.ilike.%${needle}%`,
    );
  }

  const { data, error, count } = await q;
  if (error) throw error;
  return {
    rows: (data ?? []) as unknown as SafetyIncidentRow[],
    total: count ?? 0,
  };
}

export default function SafetyIncidents() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<IncidentFilters>(INITIAL);

  const {
    rows, total, page, pageSize, totalPages,
    hasSubmitted, isLoading, isFetching,
    submit, reset, setPage, setPageSize,
  } = useManualQuery<SafetyIncidentRow, IncidentFilters>(
    ['safety', 'incidents', 'list'],
    fetchIncidentsPage,
  );

  const handleSubmit = () => submit(draft);
  const handleReset = () => { setDraft(INITIAL); reset(); };

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-primary" />
            Safety Incidents
          </h1>
          <p className="text-sm text-muted-foreground">
            7-stage workflow: Reported → Assigned → Investigation → RCA → CAPA → Verification → Closed
          </p>
        </div>
        <Button asChild>
          <Link to="/safety/incidents/new">
            <Plus className="h-4 w-4 mr-2" />
            Report Incident
          </Link>
        </Button>
      </div>

      <SafetyFilterBar
        onSubmit={handleSubmit}
        onReset={handleReset}
        isSubmitting={isFetching}
      >
        <Select value={draft.status} onValueChange={(v) => setDraft((d) => ({ ...d, status: v }))}>
          <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>{s === 'all' ? 'All statuses' : s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={draft.severity} onValueChange={(v) => setDraft((d) => ({ ...d, severity: v }))}>
          <SelectTrigger><SelectValue placeholder="Severity" /></SelectTrigger>
          <SelectContent>
            {SEVERITY_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>{s === 'all' ? 'All severities' : s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={draft.type} onValueChange={(v) => setDraft((d) => ({ ...d, type: v }))}>
          <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            {TYPE_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>{s === 'all' ? 'All types' : s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="Search title, location, or number…"
          value={draft.search}
          onChange={(e) => setDraft((d) => ({ ...d, search: e.target.value }))}
        />
      </SafetyFilterBar>

      <SafetyDataTable
        title="Incidents"
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
              <TableHead>Number</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>SLA</TableHead>
              <TableHead>Reported</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((i) => (
              <TableRow
                key={i.id}
                className="cursor-pointer hover:bg-muted/40"
                onClick={() => navigate(`/safety/incidents/${i.id}`)}
              >
                <TableCell className="font-mono text-xs">
                  {i.incident_number ?? '—'}
                </TableCell>
                <TableCell className="max-w-[280px] truncate">{i.title}</TableCell>
                <TableCell>{SAFETY_TYPE_LABELS[i.incident_type]}</TableCell>
                <TableCell>{SAFETY_SEVERITY_LABELS[i.severity]}</TableCell>
                <TableCell><SafetyStatusBadge status={i.status} /></TableCell>
                <TableCell><SlaBadge state={i.sla_state} /></TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {format(new Date(i.created_at), 'dd MMM yyyy, HH:mm')}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SafetyDataTable>
    </div>
  );
}
