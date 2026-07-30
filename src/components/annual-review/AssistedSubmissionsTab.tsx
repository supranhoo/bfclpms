import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Camera, Download, Eye, Loader2, RefreshCw, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useCycles, useActiveCycle } from '@/hooks/useAnnualReview';
import { useBusinessUnits, useDepartments } from '@/hooks/useSafetyOrg';
import { useAssistedSubmissions, useAssistedSummary } from '@/hooks/annualReview/useAssistedSubmissions';
import {
  ASSISTED_PAGE_SIZE, EVIDENCE_FILTER_OPTIONS, assistedRowsToCsv, evidenceLabel,
  type AssistedFilters, type AssistedSubmissionRow, type EvidenceFilter,
} from '@/services/annualReview/assistedSubmissions';
import { AssistedEvidenceDrawer } from '@/components/annual-review/AssistedEvidenceDrawer';
import { AnnualReviewStatusBadge } from '@/components/annual-review/AnnualReviewStatusBadge';

const ALL = '__all__';

function StatCard({ label, value, hint, tone = 'default' }: {
  label: string; value: string | number; hint?: string; tone?: 'default' | 'warn';
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-semibold ${tone === 'warn' ? 'text-destructive' : ''}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * ADR-203 — Assisted Submissions console.
 * Read-only admin/HR view of every annual review submitted on an employee's
 * behalf, with the captured evidence and a completeness audit.
 */
export function AssistedSubmissionsTab() {
  const navigate = useNavigate();
  const { data: cycles = [] } = useCycles();
  const { data: activeCycle } = useActiveCycle();
  const { data: businessUnits = [] } = useBusinessUnits();

  const [cycleId, setCycleId] = useState<string>(ALL);
  const [businessUnitId, setBusinessUnitId] = useState<string>(ALL);
  const [departmentId, setDepartmentId] = useState<string>(ALL);
  const [evidence, setEvidence] = useState<EvidenceFilter>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [drawerRow, setDrawerRow] = useState<AssistedSubmissionRow | null>(null);
  const [exporting, setExporting] = useState(false);

  const { data: departments = [] } = useDepartments(businessUnitId === ALL ? null : businessUnitId);

  const effectiveCycleId = cycleId === ALL ? (activeCycle?.id ?? null) : cycleId;

  const filters: AssistedFilters = useMemo(() => ({
    cycleId: cycleId === ALL ? null : cycleId,
    from: from || null,
    to: to || null,
    departmentId: departmentId === ALL ? null : departmentId,
    businessUnitId: businessUnitId === ALL ? null : businessUnitId,
    evidence,
    search: search || null,
  }), [cycleId, from, to, departmentId, businessUnitId, evidence, search]);

  const { data, isLoading, isFetching, refetch } = useAssistedSubmissions(filters, page);
  const { data: summary } = useAssistedSummary(cycleId === ALL ? null : cycleId);

  const rows = data?.rows ?? [];
  const total = data?.totalCount ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / ASSISTED_PAGE_SIZE));

  const resetPage = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setPage(0); };

  const handleExport = () => {
    if (rows.length === 0) { toast.info('Nothing to export on this page.'); return; }
    setExporting(true);
    try {
      const csv = assistedRowsToCsv(rows);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `assisted-submissions-page-${page + 1}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${rows.length} row(s).`);
    } catch (e) {
      toast.error(`Export failed: ${(e as Error).message}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <UserCheck className="h-4 w-4" />
                Assisted Submissions
              </CardTitle>
              <CardDescription>
                Every annual review self-stage submitted on an employee's behalf, with the
                evidence captured at the time. Read-only audit trail.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
                {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
              <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting || rows.length === 0}>
                <Download className="mr-2 h-4 w-4" />Export page
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <StatCard label="Assisted submissions" value={summary?.total_assisted ?? '—'} />
            <StatCard
              label="Share of submissions"
              value={summary ? `${summary.assisted_pct}%` : '—'}
              hint={summary ? `of ${summary.total_submitted} submitted` : undefined}
            />
            <StatCard label="Missing selfie" value={summary?.missing_selfie ?? '—'} tone="warn" />
            <StatCard label="Missing photograph" value={summary?.missing_photo ?? '—'} tone="warn" />
            <StatCard label="No evidence at all" value={summary?.missing_both ?? '—'} tone="warn" />
          </div>

          {!!summary?.top_assistors?.length && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Top assistors:</span>
              {summary.top_assistors.map((a) => (
                <Badge key={a.proxy_user_id} variant="secondary" className="font-normal">
                  {a.proxy_name}{a.proxy_code ? ` (${a.proxy_code})` : ''} · {a.cnt}
                </Badge>
              ))}
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
            <div className="space-y-1.5">
              <Label className="text-xs">Cycle</Label>
              <Select value={cycleId} onValueChange={resetPage(setCycleId)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All cycles</SelectItem>
                  {cycles.map((c: { id: string; name: string }) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Business unit</Label>
              <Select
                value={businessUnitId}
                onValueChange={(v) => { setBusinessUnitId(v); setDepartmentId(ALL); setPage(0); }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All business units</SelectItem>
                  {businessUnits.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Department</Label>
              <Select value={departmentId} onValueChange={resetPage(setDepartmentId)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All departments</SelectItem>
                  {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Evidence</Label>
              <Select value={evidence} onValueChange={resetPage((v: string) => setEvidence(v as EvidenceFilter))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EVIDENCE_FILTER_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="assisted-from">Captured from</Label>
              <Input id="assisted-from" type="date" value={from}
                onChange={(e) => { setFrom(e.target.value); setPage(0); }} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="assisted-to">Captured to</Label>
              <Input id="assisted-to" type="date" value={to}
                onChange={(e) => { setTo(e.target.value); setPage(0); }} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="assisted-search">Search employee or assistant (name / code)</Label>
            <Input id="assisted-search" value={search} placeholder="e.g. 100491 or Aditya"
              onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead className="hidden md:table-cell">Department / BU</TableHead>
                  <TableHead>Assisted by</TableHead>
                  <TableHead className="hidden lg:table-cell">Captured</TableHead>
                  <TableHead>Evidence</TableHead>
                  <TableHead className="hidden lg:table-cell">Status</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={7}><Skeleton className="h-6 w-full" /></TableCell>
                  </TableRow>
                ))}
                {!isLoading && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                      No assisted submissions match these filters.
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium">{r.employee_name ?? '—'}</div>
                      <div className="text-xs text-muted-foreground">{r.employee_code ?? '—'}</div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs">
                      <div>{r.department_name ?? '—'}</div>
                      <div className="text-muted-foreground">{r.business_unit_name ?? '—'}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{r.proxy_name ?? '—'}</div>
                      <div className="text-xs text-muted-foreground">{r.proxy_role ?? '—'}</div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-xs">
                      {new Date(r.captured_at).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={r.has_selfie || r.has_photo ? 'secondary' : 'destructive'}
                        className="gap-1 font-normal"
                      >
                        <Camera className="h-3 w-3" />{evidenceLabel(r)}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <AnnualReviewStatusBadge status={r.overall_status as never} />
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" aria-label="View evidence"
                        onClick={() => setDrawerRow(r)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {total.toLocaleString()} record(s) · page {page + 1} of {pageCount}
              {effectiveCycleId && cycleId === ALL ? ' · summary covers all cycles' : ''}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0 || isFetching}
                onClick={() => setPage((p) => Math.max(0, p - 1))}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page + 1 >= pageCount || isFetching}
                onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <AssistedEvidenceDrawer
        row={drawerRow}
        onOpenChange={(open) => { if (!open) setDrawerRow(null); }}
        onOpenReview={(instanceId) => navigate(`/annual-review/team/${instanceId}`)}
      />
    </div>
  );
}
