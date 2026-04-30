import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Plus, FileSignature } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useManualQuery, type ManualQueryFetcherArgs } from '@/hooks/useManualQuery';
import { SafetyFilterSheet } from '@/components/safety/SafetyFilterSheet';
import { SafetyResponsiveList } from '@/components/safety/SafetyResponsiveList';
import { SafetyMobileListCard } from '@/components/safety/SafetyMobileListCard';
import { SafetyStickyActionBar } from '@/components/safety/SafetyStickyActionBar';
import {
  SAFETY_PERMIT_STATUSES,
  SAFETY_PERMIT_STATUS_LABEL,
  SAFETY_PERMIT_TYPES,
  SAFETY_PERMIT_TYPE_LABEL,
} from '@/lib/safetyPermits';
import { PermitStatusBadge } from '@/components/safety/PermitStatusBadge';
import { format } from 'date-fns';

/**
 * Permits list — POLICY §113 / ADR-050.
 * Filters first → click Search → paginated server query.
 */

interface PermitFilters {
  status: string;
  type: string;
  search: string;
}

const INITIAL: PermitFilters = { status: 'all', type: 'all', search: '' };

interface PermitRow {
  id: string;
  permit_number: string | null;
  permit_type: typeof SAFETY_PERMIT_TYPES[number];
  status: typeof SAFETY_PERMIT_STATUSES[number];
  scope: string;
  location: string;
  start_at: string;
  end_at: string;
  current_level: number;
  total_levels: number;
}

async function fetchPermitsPage({
  filters, range,
}: ManualQueryFetcherArgs<PermitFilters>): Promise<{ rows: PermitRow[]; total: number }> {
  let q = supabase
    .from('safety_permits' as never)
    .select(
      'id, permit_number, permit_type, status, scope, location, start_at, end_at, current_level, total_levels',
      { count: 'exact' },
    )
    .order('start_at', { ascending: false })
    .range(range[0], range[1]);

  if (filters.status !== 'all') q = q.eq('status', filters.status);
  if (filters.type !== 'all') q = q.eq('permit_type', filters.type);
  if (filters.search.trim()) {
    const needle = filters.search.trim();
    q = q.or(
      `permit_number.ilike.%${needle}%,scope.ilike.%${needle}%,location.ilike.%${needle}%`,
    );
  }

  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: (data ?? []) as unknown as PermitRow[], total: count ?? 0 };
}

export default function SafetyPermits() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<PermitFilters>(INITIAL);
  const {
    rows, total, page, pageSize, totalPages,
    hasSubmitted, isLoading, isFetching,
    submit, reset, setPage, setPageSize,
  } = useManualQuery<PermitRow, PermitFilters>(['safety', 'permits', 'list'], fetchPermitsPage);

  const activeCount = useMemo(() => {
    let n = 0;
    if (draft.status !== 'all') n++;
    if (draft.type !== 'all') n++;
    if (draft.search.trim()) n++;
    return n;
  }, [draft]);

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex flex-wrap items-start gap-3 sm:gap-4">
        <div className="p-2.5 sm:p-3 rounded-xl bg-primary/10 text-primary">
          <FileSignature className="h-5 w-5 sm:h-6 sm:w-6" />
        </div>
        <div className="flex-1 min-w-[220px]">
          <h1 className="text-xl sm:text-3xl font-bold text-foreground">Permits to Work</h1>
          <p className="text-xs sm:text-base text-muted-foreground">
            Issue, approve, activate, and close work permits across BUs and departments.
          </p>
        </div>
        <Button asChild className="hidden md:inline-flex">
          <Link to="/safety/permits/new" className="flex items-center gap-2">
            <Plus className="h-4 w-4" /> New Permit
          </Link>
        </Button>
      </div>

      <SafetyFilterSheet
        onSubmit={() => submit(draft)}
        onReset={() => { setDraft(INITIAL); reset(); }}
        isSubmitting={isFetching}
        activeCount={activeCount}
      >
        <Select value={draft.status} onValueChange={(v) => setDraft((d) => ({ ...d, status: v }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {SAFETY_PERMIT_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{SAFETY_PERMIT_STATUS_LABEL[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={draft.type} onValueChange={(v) => setDraft((d) => ({ ...d, type: v }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {SAFETY_PERMIT_TYPES.map((t) => (
              <SelectItem key={t} value={t}>{SAFETY_PERMIT_TYPE_LABEL[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="Search scope, location, permit no…"
          value={draft.search}
          onChange={(e) => setDraft((d) => ({ ...d, search: e.target.value }))}
        />
      </SafetyFilterSheet>

      <SafetyResponsiveList
        title="Permits"
        hasSubmitted={hasSubmitted}
        isLoading={isLoading}
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        totalPages={totalPages}
        onPageChange={setPage}
        mobileRender={(r) => (
          <SafetyMobileListCard
            onClick={() => navigate(`/safety/permits/${r.id}`)}
            title={
              <span>
                <span className="font-mono text-xs text-muted-foreground mr-1">
                  {r.permit_number ?? '—'}
                </span>
                {SAFETY_PERMIT_TYPE_LABEL[r.permit_type]}
              </span>
            }
            subtitle={`${r.scope} · ${r.location}`}
            meta={
              <>
                {format(new Date(r.start_at), 'dd MMM HH:mm')} → {format(new Date(r.end_at), 'dd MMM HH:mm')}
                {' · L'}{r.current_level}/{r.total_levels}
              </>
            }
            badges={<PermitStatusBadge status={r.status} />}
          />
        )}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Scope / Location</TableHead>
              <TableHead>Window</TableHead>
              <TableHead>Level</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} className="cursor-pointer hover:bg-muted/40">
                <TableCell className="font-mono text-xs">
                  <Link to={`/safety/permits/${r.id}`} className="hover:underline">
                    {r.permit_number ?? '—'}
                  </Link>
                </TableCell>
                <TableCell className="text-xs">{SAFETY_PERMIT_TYPE_LABEL[r.permit_type]}</TableCell>
                <TableCell className="text-xs max-w-[260px] truncate">
                  {r.scope} · {r.location}
                </TableCell>
                <TableCell className="text-xs whitespace-nowrap">
                  {format(new Date(r.start_at), 'dd MMM HH:mm')}
                  {' → '}
                  {format(new Date(r.end_at), 'dd MMM HH:mm')}
                </TableCell>
                <TableCell className="text-xs">L{r.current_level}/{r.total_levels}</TableCell>
                <TableCell><PermitStatusBadge status={r.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SafetyResponsiveList>

      <SafetyStickyActionBar>
        <Button asChild className="h-11">
          <Link to="/safety/permits/new" className="flex items-center justify-center gap-2">
            <Plus className="h-4 w-4" /> New Permit
          </Link>
        </Button>
      </SafetyStickyActionBar>
    </div>
  );
}
