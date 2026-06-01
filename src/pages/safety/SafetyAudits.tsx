import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Plus, ClipboardCheck, ArrowRight, BarChart3, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useManualQuery, type ManualQueryFetcherArgs } from '@/hooks/useManualQuery';
import { useSafetyRealtimeSync } from '@/hooks/useSafetyRealtimeSync';
import { SafetyFilterBar } from '@/components/safety/SafetyFilterBar';
import { SafetyDataTable } from '@/components/safety/SafetyDataTable';
import {
  SAFETY_AUDIT_RUN_STATUSES,
  SAFETY_AUDIT_RUN_STATUS_LABEL,
  type SafetyAuditRunStatus,
  complianceBand,
  COMPLIANCE_BAND_TONE,
  COMPLIANCE_BAND_LABEL,
} from '@/lib/safetyAudits';
import { AuditRunStatusBadge } from '@/components/safety/AuditRunStatusBadge';
import { format } from 'date-fns';

/**
 * Audit hub — POLICY §113 / ADR-050.
 * Filters first → Search → paginated runs list.
 */

interface RunFilters {
  status: SafetyAuditRunStatus | 'all';
}

const INITIAL: RunFilters = { status: 'all' };

interface RunRow {
  id: string;
  template_id: string;
  template_title: string | null;
  status: SafetyAuditRunStatus;
  conducted_at: string;
  location: string | null;
  score: number | null;
  critical_failures: number;
}

async function fetchRunsPage({
  filters, range,
}: ManualQueryFetcherArgs<RunFilters>): Promise<{ rows: RunRow[]; total: number }> {
  let q = supabase
    .from('safety_audit_runs' as never)
    .select(
      'id, template_id, status, conducted_at, location, score, critical_failures, safety_audit_templates(title)',
      { count: 'exact' },
    )
    .order('conducted_at', { ascending: false })
    .range(range[0], range[1]);

  if (filters.status !== 'all') q = q.eq('status', filters.status);

  const { data, error, count } = await q;
  if (error) throw error;
  const rows: RunRow[] = (data ?? []).map((r: any) => ({
    id: r.id,
    template_id: r.template_id,
    template_title: r.safety_audit_templates?.title ?? null,
    status: r.status,
    conducted_at: r.conducted_at,
    location: r.location,
    score: r.score,
    critical_failures: r.critical_failures ?? 0,
  }));
  return { rows, total: count ?? 0 };
}

export default function SafetyAudits() {
  // Scoped realtime: audit runs, responses, and template metadata.
  useSafetyRealtimeSync(true, [
    'safety_audit_runs',
    'safety_audit_run_responses',
    'safety_audit_templates',
    'safety_audit_template_items',
  ]);
  const [draft, setDraft] = useState<RunFilters>(INITIAL);
  const {
    rows, total, page, pageSize, totalPages,
    hasSubmitted, isLoading, isFetching,
    submit, reset, setPage, setPageSize,
  } = useManualQuery<RunRow, RunFilters>(['safety', 'audits', 'runs', 'list'], fetchRunsPage);

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-start gap-4">
        <div className="p-3 rounded-xl bg-primary/10 text-primary">
          <ClipboardCheck className="h-6 w-6" />
        </div>
        <div className="flex-1 min-w-[220px]">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Audits & Compliance</h1>
          <p className="text-muted-foreground">
            Run safety checklists, auto-create incidents on critical NOs, and track BU compliance.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/safety/audits/scoreboard"><BarChart3 className="h-4 w-4 mr-2" /> Scoreboard</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/safety/audits/templates"><FileText className="h-4 w-4 mr-2" /> Templates</Link>
        </Button>
        <Button asChild>
          <Link to="/safety/audits/runs/new"><Plus className="h-4 w-4 mr-2" /> Start Audit</Link>
        </Button>
      </div>

      <SafetyFilterBar
        onSubmit={() => submit(draft)}
        onReset={() => { setDraft(INITIAL); reset(); }}
        isSubmitting={isFetching}
      >
        <Select value={draft.status} onValueChange={(v) => setDraft({ status: v as RunFilters['status'] })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {SAFETY_AUDIT_RUN_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{SAFETY_AUDIT_RUN_STATUS_LABEL[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SafetyFilterBar>

      <SafetyDataTable
        title="Audit runs"
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
              <TableHead>Template</TableHead>
              <TableHead>Conducted</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Critical NO</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[40px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const band = complianceBand(r.score);
              return (
                <TableRow key={r.id} className="cursor-pointer hover:bg-muted/40">
                  <TableCell className="text-xs">
                    <Link to={`/safety/audits/runs/${r.id}`} className="hover:underline font-medium">
                      {r.template_title ?? 'Audit Run'}
                    </Link>
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {format(new Date(r.conducted_at), 'dd MMM yyyy HH:mm')}
                  </TableCell>
                  <TableCell className="text-xs max-w-[180px] truncate">{r.location ?? '—'}</TableCell>
                  <TableCell className="text-xs">{r.critical_failures || '—'}</TableCell>
                  <TableCell className="text-xs">
                    {r.score !== null ? (
                      <Badge variant={COMPLIANCE_BAND_TONE[band]} className="text-[11px]">
                        {r.score.toFixed(1)} · {COMPLIANCE_BAND_LABEL[band].split(' ')[0]}
                      </Badge>
                    ) : '—'}
                  </TableCell>
                  <TableCell><AuditRunStatusBadge status={r.status} /></TableCell>
                  <TableCell><ArrowRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </SafetyDataTable>
    </div>
  );
}
