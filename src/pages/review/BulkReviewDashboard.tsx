import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Layers, RefreshCw, Search, SlidersHorizontal, EyeOff, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { CompanyFilter } from '@/components/reports/CompanyFilter';
import { useCompanyFilter } from '@/hooks/useCompanyFilter';
import {
  useDepartments,
  useBusinessUnits,
  useDivisions,
  useKraCategories,
} from '@/hooks/useOrganization';
import { useAuth } from '@/contexts/AuthContext';
import {
  useBulkReviewFlag,
  useBulkScopePreview,
  useBulkReviewSnapshot,
  useBulkManagementApprove,
  type BulkScopeFilters,
  type BulkReviewRow,
} from '@/hooks/useBulkReview';
import { BulkCellDrawer } from '@/components/review/BulkCellDrawer';
import { BulkReviewMatrixGrid } from '@/components/review/BulkReviewMatrixGrid';
import { useToast } from '@/hooks/use-toast';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';

// Full month names — must match kpis.review_period exactly (DB stores 'April', 'May', ...).
// Ordered by fiscal year (Apr → Mar) for display.
const PERIOD_OPTIONS = [
  'April', 'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'December', 'January', 'February', 'March',
];
const CALENDAR_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const VIEWER_STAGES = [
  { value: 'manager', label: 'Manager' },
  { value: 'skip_level', label: 'Skip-Level' },
  { value: 'hr_pms', label: 'HR PMS' },
  { value: 'auditor', label: 'Auditor' },
  { value: 'management', label: 'Management' },
];

/**
 * Bulk Review Dashboard (PRD v2.0, Phase 1 — M2 shell).
 *
 * Hard rules enforced here:
 *  - Mounts empty. No `kpis`/`review_submissions` reads on mount.
 *  - Filter changes only fire `bulk_scope_preview` (counts).
 *  - Snapshot RPC fires only after explicit "Load Scope" click.
 *  - 25k cell / 5MB payload cap disables Load button.
 *  - No realtime — manual Refresh pill only.
 */
export default function BulkReviewDashboard() {
  const { effectiveRole } = useAuth();
  const { toast } = useToast();
  const flagQuery = useBulkReviewFlag();

  const now = new Date();
  const defaultPeriod = CALENDAR_MONTHS[now.getMonth()] || 'April';
  const defaultYear = now.getFullYear();

  const [period, setPeriod] = useState<string>(defaultPeriod);
  const [year, setYear] = useState<number>(defaultYear);
  const [viewerStage, setViewerStage] = useState<string>(
    effectiveRole === 'manager' ? 'manager'
      : effectiveRole === 'auditor' ? 'auditor'
      : effectiveRole === 'hr_pms' ? 'hr_pms'
      : effectiveRole === 'management' ? 'management'
      : effectiveRole === 'skip_level' ? 'skip_level'
      : 'manager'
  );
  const [divisionId, setDivisionId] = useState<string>('');
  const [businessUnitId, setBusinessUnitId] = useState<string>('');
  const [departmentId, setDepartmentId] = useState<string>('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [displayMode, setDisplayMode] = useState<'score' | 'wt' | 'both'>('score');
  const [hideEmpty, setHideEmpty] = useState(false);
  const [scopeLoaded, setScopeLoaded] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeRow, setActiveRow] = useState<BulkReviewRow | null>(null);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const approve = useBulkManagementApprove();

  const { companies, selectedCompanyId, setSelectedCompanyId } = useCompanyFilter();
  const { data: departments } = useDepartments();
  const { data: businessUnits } = useBusinessUnits();
  const { data: divisions } = useDivisions();
  const { data: categories } = useKraCategories();

  const filteredBusinessUnits = useMemo(() => {
    if (!divisionId) return businessUnits ?? [];
    return (businessUnits ?? []).filter((bu: any) => bu.division_id === divisionId);
  }, [businessUnits, divisionId]);
  const filteredDepartments = useMemo(() => {
    let list = departments ?? [];
    if (businessUnitId) list = list.filter((d: any) => d.business_unit_id === businessUnitId);
    else if (divisionId) {
      const buIds = new Set(filteredBusinessUnits.map((b: any) => b.id));
      list = list.filter((d: any) => buIds.has(d.business_unit_id));
    }
    return list;
  }, [departments, businessUnitId, divisionId, filteredBusinessUnits]);

  const filters: BulkScopeFilters = useMemo(() => ({
    department_id: departmentId || null,
    company_id: selectedCompanyId && selectedCompanyId !== 'all' ? selectedCompanyId : null,
    division_id: divisionId || null,
    business_unit_id: businessUnitId || null,
    category_id: categoryId || null,
  }), [departmentId, selectedCompanyId, divisionId, businessUnitId, categoryId]);

  const activeFilterCount = [
    selectedCompanyId && selectedCompanyId !== 'all' ? 1 : 0,
    divisionId ? 1 : 0,
    businessUnitId ? 1 : 0,
    departmentId ? 1 : 0,
    categoryId ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  const invalidateScope = () => setScopeLoaded(false);

  const flagOn = flagQuery.data === true;

  const preview = useBulkScopePreview(period, year, filters, flagOn);
  const snapshot = useBulkReviewSnapshot(
    period, year, viewerStage, filters, page, 200,
    flagOn && scopeLoaded,
  );

  const capExceeded = preview.data?.cap_exceeded ?? false;
  const canLoad = flagOn && !!preview.data && !capExceeded && (preview.data?.cell_count ?? 0) > 0;

  const rawRows = snapshot.data?.rows ?? [];
  const loadedRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    let rows = rawRows;
    if (term) {
      rows = rows.filter(r =>
        (r.kpi_name ?? '').toLowerCase().includes(term)
        || (r.kra_name ?? '').toLowerCase().includes(term)
        || (r.employee_name ?? '').toLowerCase().includes(term)
        || (r.employee_code ?? '').toLowerCase().includes(term),
      );
    }
    if (hideEmpty) {
      rows = rows.filter(r => {
        const scores = [r.self_score, r.manager_score, r.skip_level_score, r.hr_pms_score, r.auditor_score, r.management_score, r.final_score];
        return scores.some(s => s !== null && s !== undefined);
      });
    }
    return rows;
  }, [rawRows, search, hideEmpty]);

  const variance = useMemo(() => {
    let count = 0;
    for (const r of loadedRows) {
      const scores = [
        r.self_score, r.manager_score, r.skip_level_score,
        r.hr_pms_score, r.auditor_score, r.management_score,
      ].filter((s): s is number => s !== null && s !== undefined);
      if (scores.length >= 2) {
        const max = Math.max(...scores);
        const min = Math.min(...scores);
        if (max - min > 1.0) count++;
      }
    }
    return count;
  }, [loadedRows]);

  const canApprove = effectiveRole === 'management' || effectiveRole === 'admin';
  const canReopen = effectiveRole === 'admin' || effectiveRole === 'management';

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleAllFromMatrix = (ids: string[]) => {
    setSelectedIds((prev) => {
      const allSelected = ids.length > 0 && ids.every(id => prev.has(id));
      return allSelected ? new Set() : new Set(ids);
    });
  };

  const handleBulkApprove = async () => {
    const cells = loadedRows
      .filter(r => r.submission_id && selectedIds.has(r.submission_id))
      .map(r => ({ submission_id: r.submission_id!, expected_row_version: r.row_version ?? null }));
    if (cells.length === 0) return;
    try {
      const res = await approve.mutateAsync({ cells, reason: 'Bulk approval from dashboard' });
      toast({
        title: `Approved ${res.applied} / ${cells.length}`,
        description: res.skipped.length ? `${res.skipped.length} skipped — see audit log` : undefined,
      });
      setSelectedIds(new Set());
    } catch (e: any) {
      toast({ title: 'Approval failed', description: e.message, variant: 'destructive' });
    }
  };

  // Flag OFF → hard refuse
  if (flagQuery.isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!flagOn) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Bulk Review is disabled</AlertTitle>
          <AlertDescription>
            Bulk Review is disabled by your administrator. Please use the
            standard <Link to="/dashboard?view=team" className="underline">Team Reviews</Link> page.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Sticky utility bar — title + toolbar + counters all in one strip */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b">
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 min-h-12">
          {/* Title chip */}
          <div className="flex items-center gap-1.5 pr-2 mr-1 border-r">
            <Layers className="h-4 w-4 text-primary" />
            <h1 className="text-sm font-semibold whitespace-nowrap">Bulk Review</h1>
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">Beta</Badge>
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search KPI / Employee…"
                className="pl-8 h-9"
              />
            </div>

            {/* Wt% / Score / Both */}
            <ToggleGroup
              type="single"
              value={displayMode}
              onValueChange={(v) => v && setDisplayMode(v as 'score' | 'wt' | 'both')}
              className="h-9"
            >
              <ToggleGroupItem value="wt" className="h-9 px-3 text-xs">Wt%</ToggleGroupItem>
              <ToggleGroupItem value="score" className="h-9 px-3 text-xs">Score</ToggleGroupItem>
              <ToggleGroupItem value="both" className="h-9 px-3 text-xs">Both</ToggleGroupItem>
            </ToggleGroup>

            {/* Hide empty */}
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5"
              onClick={() => setHideEmpty(v => !v)}
              aria-pressed={hideEmpty}
              title={hideEmpty ? 'Show all rows' : 'Hide unscored rows'}
            >
              {hideEmpty ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </Button>

            {/* Stage (separate from scope filters) */}
            <Select value={viewerStage} onValueChange={setViewerStage}>
              <SelectTrigger className="h-9 w-[140px] text-xs"><SelectValue placeholder="Stage" /></SelectTrigger>
              <SelectContent>
                {VIEWER_STAGES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Filters popover */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5">
                  <SlidersHorizontal className="h-4 w-4" />
                  Filters
                  {activeFilterCount > 0 && (
                    <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">{activeFilterCount}</Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[480px] p-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Month</Label>
                    <Select value={period} onValueChange={(v) => { setPeriod(v); invalidateScope(); }}>
                      <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PERIOD_OPTIONS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Year</Label>
                    <Input
                      type="number"
                      value={year}
                      onChange={(e) => { setYear(Number(e.target.value) || defaultYear); invalidateScope(); }}
                      className="h-8 text-xs mt-1"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Company</Label>
                    <div className="mt-1">
                      <CompanyFilter
                        companies={companies}
                        selectedCompanyId={selectedCompanyId}
                        onCompanyChange={(v) => { setSelectedCompanyId(v); invalidateScope(); }}
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Division</Label>
                    <Select
                      value={divisionId || 'all'}
                      onValueChange={(v) => {
                        setDivisionId(v === 'all' ? '' : v);
                        setBusinessUnitId(''); setDepartmentId('');
                        invalidateScope();
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs mt-1"><SelectValue placeholder="Division" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Divisions</SelectItem>
                        {(divisions ?? []).map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Business Unit</Label>
                    <Select
                      value={businessUnitId || 'all'}
                      onValueChange={(v) => {
                        setBusinessUnitId(v === 'all' ? '' : v);
                        setDepartmentId('');
                        invalidateScope();
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs mt-1"><SelectValue placeholder="Business Unit" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Business Units</SelectItem>
                        {filteredBusinessUnits.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Department</Label>
                    <Select
                      value={departmentId || 'all'}
                      onValueChange={(v) => { setDepartmentId(v === 'all' ? '' : v); invalidateScope(); }}
                    >
                      <SelectTrigger className="h-8 text-xs mt-1"><SelectValue placeholder="Department" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Departments</SelectItem>
                        {filteredDepartments.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Category</Label>
                    <Select
                      value={categoryId || 'all'}
                      onValueChange={(v) => { setCategoryId(v === 'all' ? '' : v); invalidateScope(); }}
                    >
                      <SelectTrigger className="h-8 text-xs mt-1"><SelectValue placeholder="Category" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        {(categories ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            <Button
              size="sm"
              className="h-9"
              disabled={!canLoad}
              onClick={() => { setPage(1); setScopeLoaded(true); }}
            >
              Load Scope
            </Button>

          {scopeLoaded && (
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 ml-auto"
              onClick={() => snapshot.refetch()}
              disabled={snapshot.isFetching}
              title="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${snapshot.isFetching ? 'animate-spin' : ''}`} />
            </Button>
          )}
        </div>

        {/* Meta strip — preview counters + matrix stats merged */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 pb-1.5 text-[11px] text-muted-foreground">
          {preview.isLoading ? (
            <Skeleton className="h-3 w-48" />
          ) : preview.data ? (
            <>
              <span><strong className="text-foreground tabular-nums">{preview.data.emp_count}</strong> emp</span>
              <span><strong className="text-foreground tabular-nums">{preview.data.kpi_count}</strong> KPI</span>
              <span>~{preview.data.est_payload_kb} KB</span>
              {capExceeded && (
                <Badge variant="destructive" className="h-4 px-1.5 text-[10px]">
                  Scope too large — narrow filters (cap: 25k cells / 5 MB)
                </Badge>
              )}
            </>
          ) : null}
          {scopeLoaded && snapshot.data && (
            <>
              <span className="opacity-50">•</span>
              <span>Page <strong className="text-foreground tabular-nums">{page}</strong>/<strong className="text-foreground tabular-nums">{Math.max(1, Math.ceil((snapshot.data.total ?? 0) / 200))}</strong></span>
              <span><strong className="text-foreground tabular-nums">{snapshot.data.rows?.length ?? 0}</strong>/<strong className="text-foreground tabular-nums">{snapshot.data.total ?? 0}</strong> rows</span>
              <span>Δ&gt;1: <strong className="text-foreground tabular-nums">{variance}</strong></span>
            </>
          )}
        </div>
      </div>

      {/* Empty state */}
      {!scopeLoaded && (
        <div className="p-3 md:p-4">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Layers className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium text-foreground mb-1">Pick a scope and click Load Scope</p>
            <p className="text-sm">
              Nothing is fetched until you do — your dashboard stays fast and Cloud-friendly.
            </p>
          </CardContent>
        </Card>
        </div>
      )}

      {/* Loaded grid */}
      {scopeLoaded && (
        <div className="px-2 md:px-3 pt-2 pb-3 space-y-2">
          {snapshot.isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : snapshot.error ? (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Failed to load snapshot</AlertTitle>
                  <AlertDescription>{(snapshot.error as Error).message}</AlertDescription>
                </Alert>
              ) : loadedRows.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  No KPIs match the selected scope.
                </p>
              ) : (
                <BulkReviewMatrixGrid
                  rows={loadedRows}
                  viewerStage={viewerStage}
                  selectedSubmissionIds={selectedIds}
                  onToggleSubmission={toggleOne}
                  onToggleAll={toggleAllFromMatrix}
                  onCellClick={setActiveRow}
                  displayMode={displayMode}
                />
              )}

              {/* Pagination */}
              {snapshot.data && snapshot.data.total > 200 && (
                <div className="flex items-center justify-between mt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >Previous</Button>
                  <span className="text-xs text-muted-foreground">
                    Page {page} of {Math.max(1, Math.ceil(snapshot.data.total / 200))}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= Math.ceil(snapshot.data.total / 200)}
                    onClick={() => setPage((p) => p + 1)}
                  >Next</Button>
                </div>
              )}

          {/* Action toolbar */}
          {selectedIds.size > 0 && (
            <div className="sticky bottom-4 z-10 mx-auto max-w-fit">
              <Card className="shadow-lg">
                <CardContent className="py-3 px-4 flex items-center gap-3">
                  <span className="text-sm font-medium">{selectedIds.size} selected</span>
                  <Button size="sm" variant="outline" onClick={() => setSelectedIds(new Set())}>
                    Clear
                  </Button>
                  {canApprove && (
                    <Button
                      size="sm"
                      onClick={() => setConfirmApprove(true)}
                      disabled={approve.isPending}
                    >
                      {approve.isPending ? 'Approving…' : 'Bulk Approve (Mgmt)'}
                    </Button>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      <BulkCellDrawer
        row={activeRow}
        viewerStage={viewerStage}
        open={!!activeRow}
        onOpenChange={(o) => !o && setActiveRow(null)}
        canReopen={canReopen}
      />

      <ConfirmDestructiveDialog
        open={confirmApprove}
        onCancel={() => setConfirmApprove(false)}
        onConfirm={() => { setConfirmApprove(false); handleBulkApprove(); }}
        title={`Bulk approve ${selectedIds.size} cells?`}
        description="Final scores will be stamped from the highest-priority completed stage (Auditor > HR PMS > Skip-Level > Manager). Per Policy §88 this is immutable except via Re-open."
        confirmLabel="Approve"
        isLoading={approve.isPending}
      />
    </div>
  );
}
