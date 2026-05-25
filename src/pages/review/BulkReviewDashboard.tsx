import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle, Layers, RefreshCw, Search, EyeOff, Eye,
  Calendar, CalendarDays, Building2, Network, Factory, Users, Tag, UserCog, Target,
  IdCard, Award,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
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
  useBulkReviewSnapshotAll,
  useBulkManagementApprove,
  useBulkOrgKpiFlags,
  useBulkEmployeeAttrs,
  type BulkScopeFilters,
  type BulkReviewRow,
} from '@/hooks/useBulkReview';
import { BulkCellDrawer } from '@/components/review/BulkCellDrawer';
import { BulkReviewMatrixGrid } from '@/components/review/BulkReviewMatrixGrid';
import { useToast } from '@/hooks/use-toast';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';
import { MultiSelectFilter } from '@/components/review/MultiSelectFilter';
import { readUrlArrays, writeUrlArrays } from '@/lib/bulkUrlState';
import {
  allowedEmployeeIds, distinctAttrOptions, BLANK_SENTINEL, type EmpAttrs,
} from '@/lib/bulkEmployeeFilter';

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
  // Multi-select state — empty array = "All". Persisted to URL query params.
  const initialUrl = useMemo(
    () => readUrlArrays(
      typeof window !== 'undefined' ? window.location.search : '',
      ['companies', 'divisions', 'bus', 'depts', 'cats', 'kras', 'desigs', 'grades', 'mgrs'],
    ),
    [],
  );
  const [companyIds, setCompanyIds] = useState<string[]>(initialUrl.companies);
  const [divisionIds, setDivisionIds] = useState<string[]>(initialUrl.divisions);
  const [businessUnitIds, setBusinessUnitIds] = useState<string[]>(initialUrl.bus);
  const [departmentIds, setDepartmentIds] = useState<string[]>(initialUrl.depts);
  const [categoryIds, setCategoryIds] = useState<string[]>(initialUrl.cats);
  const [kraNames, setKraNames] = useState<string[]>(initialUrl.kras);
  const [designations, setDesignations] = useState<string[]>(initialUrl.desigs);
  const [grades, setGrades] = useState<string[]>(initialUrl.grades);
  const [managerIds, setManagerIds] = useState<string[]>(initialUrl.mgrs);
  const [search, setSearch] = useState('');
  const [displayMode, setDisplayMode] = useState<'score' | 'wt' | 'both'>('score');
  const [hideEmpty, setHideEmpty] = useState(false);
  const [scopeLoaded, setScopeLoaded] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeRow, setActiveRow] = useState<BulkReviewRow | null>(null);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const approve = useBulkManagementApprove();

  const { companies } = useCompanyFilter();
  const { data: departments } = useDepartments();
  const { data: businessUnits } = useBusinessUnits();
  const { data: divisions } = useDivisions();
  const { data: categories } = useKraCategories();

  // URL persistence — push current arrays back into the query string. Empty
  // arrays are stripped (`writeUrlArrays`) so the URL stays clean on reset.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const nextSearch = writeUrlArrays(window.location.search, {
      companies: companyIds, divisions: divisionIds, bus: businessUnitIds,
      depts: departmentIds, cats: categoryIds, kras: kraNames,
      desigs: designations, grades, mgrs: managerIds,
    });
    const newUrl = `${window.location.pathname}${nextSearch}${window.location.hash}`;
    window.history.replaceState(null, '', newUrl);
  }, [companyIds, divisionIds, businessUnitIds, departmentIds, categoryIds, kraNames,
      designations, grades, managerIds]);

  const filteredBusinessUnits = useMemo(() => {
    if (divisionIds.length === 0) return businessUnits ?? [];
    const set = new Set(divisionIds);
    return (businessUnits ?? []).filter((bu: any) => set.has(bu.division_id));
  }, [businessUnits, divisionIds]);
  const filteredDepartments = useMemo(() => {
    let list = departments ?? [];
    if (businessUnitIds.length > 0) {
      const set = new Set(businessUnitIds);
      list = list.filter((d: any) => set.has(d.business_unit_id));
    } else if (divisionIds.length > 0) {
      const buIds = new Set(filteredBusinessUnits.map((b: any) => b.id));
      list = list.filter((d: any) => buIds.has(d.business_unit_id));
    }
    return list;
  }, [departments, businessUnitIds, divisionIds, filteredBusinessUnits]);

  // Server-side `bulk_scope_preview` / `bulk_review_snapshot` accept a single
  // value per axis. When the user picks ONE option we forward it (so the cap
  // check is tight); when they pick multiple, we send `null` (broadest scope)
  // and apply the multi-filter client-side over `rawRows` below — same
  // pattern as the KRA filter shipped in v2.66.12.5.
  const oneOrNull = (arr: string[]): string | null => arr.length === 1 ? arr[0] : null;
  const filters: BulkScopeFilters = useMemo(() => ({
    department_id: oneOrNull(departmentIds),
    company_id: oneOrNull(companyIds),
    division_id: oneOrNull(divisionIds),
    business_unit_id: oneOrNull(businessUnitIds),
    category_id: oneOrNull(categoryIds),
  }), [departmentIds, companyIds, divisionIds, businessUnitIds, categoryIds]);

  const activeFilterCount =
    (companyIds.length > 0 ? 1 : 0) +
    (divisionIds.length > 0 ? 1 : 0) +
    (businessUnitIds.length > 0 ? 1 : 0) +
    (departmentIds.length > 0 ? 1 : 0) +
    (categoryIds.length > 0 ? 1 : 0) +
    (kraNames.length > 0 ? 1 : 0) +
    (designations.length > 0 ? 1 : 0) +
    (grades.length > 0 ? 1 : 0) +
    (managerIds.length > 0 ? 1 : 0);

  const invalidateScope = () => setScopeLoaded(false);

  const flagOn = flagQuery.data === true;

  const preview = useBulkScopePreview(period, year, filters, flagOn);
  // Matrix mode → accumulate every page so all mapped employees are reachable.
  // Flat / non-matrix usage (legacy) keeps the paged snapshot intact.
  const snapshotAll = useBulkReviewSnapshotAll(
    period, year, viewerStage, filters,
    flagOn && scopeLoaded,
  );
  const snapshot = snapshotAll;

  // Reset KRA selection whenever Category / Period / Year changes so a stale
  // KRA value never silently filters out everything.
  useEffect(() => {
    setKraNames([]);
  }, [categoryIds, period, year]);

  const capExceeded = preview.data?.cap_exceeded ?? false;
  const canLoad = flagOn && !!preview.data && !capExceeded && (preview.data?.cell_count ?? 0) > 0;

  const rawRows = snapshot.data?.rows ?? [];
  const kraOptionList = useMemo(() => {
    const set = new Set<string>();
    for (const r of rawRows) {
      const name = (r.kra_name ?? '').trim();
      if (name) set.add(name);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rawRows]);

  // Multi-axis client-side filter over the snapshot.
  const loadedRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const kraSet = new Set(kraNames);
    let rows = rawRows;
    if (kraSet.size > 0) {
      rows = rows.filter(r => kraSet.has(r.kra_name ?? ''));
    }
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
  }, [rawRows, search, hideEmpty, kraNames]);

  // Org-KPI flags for the currently loaded snapshot.
  const distinctKpiIds = useMemo(() => {
    const s = new Set<string>();
    for (const r of rawRows) if (r.kpi_id) s.add(r.kpi_id);
    return Array.from(s);
  }, [rawRows]);
  const orgFlagsQ = useBulkOrgKpiFlags(distinctKpiIds, scopeLoaded);
  const isOrgByKpiId = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const f of orgFlagsQ.data ?? []) m.set(f.kpi_id, f.is_org_level);
    return m;
  }, [orgFlagsQ.data]);

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
      {/* Sticky 2-row header — strict grid rhythm */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b shadow-sm">
        {/* Row 1 — identity · search · primary actions */}
        <div className="flex items-center gap-3 px-4 h-12 border-b border-border/40">
          {/* Title chip + inline counters */}
          <div className="flex items-center gap-2 shrink-0">
            <Layers className="h-4 w-4 text-primary" />
            <h1 className="text-sm font-semibold whitespace-nowrap">Bulk Review</h1>
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">Beta</Badge>
            {preview.isLoading ? (
              <Skeleton className="h-3 w-32 ml-1" />
            ) : preview.data ? (
              <span className="hidden md:flex items-center gap-2 ml-1 text-[11px] text-muted-foreground tabular-nums">
                <span><strong className="text-foreground">{preview.data.emp_count}</strong> emp</span>
                <span className="opacity-40">·</span>
                <span><strong className="text-foreground">{preview.data.kpi_count}</strong> KPI</span>
                <span className="opacity-40">·</span>
                <span>~{preview.data.est_payload_kb} KB</span>
                {scopeLoaded && snapshot.data && (
                  <>
                    <span className="opacity-40">·</span>
                    <span><strong className="text-foreground">{snapshot.data.rows?.length ?? 0}</strong>/<strong className="text-foreground">{snapshot.data.total ?? 0}</strong> rows</span>
                    <span className="opacity-40">·</span>
                    <span>Δ&gt;1: <strong className="text-foreground">{variance}</strong></span>
                  </>
                )}
                {capExceeded && (
                  <Badge variant="destructive" className="h-4 px-1.5 text-[10px] ml-1">Scope too large</Badge>
                )}
              </span>
            ) : null}
          </div>

          {/* Search — anchored, fills middle */}
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search KPI / Employee…"
              className="pl-8 h-9"
              aria-label="Search KPI or employee"
            />
          </div>

          {/* Right action cluster */}
          <div className="flex items-center gap-2 shrink-0 pl-3 border-l border-border/50">
            <Select value={viewerStage} onValueChange={setViewerStage}>
              <SelectTrigger className="h-9 w-[140px] text-xs" aria-label="Reviewer stage">
                <div className="flex items-center gap-1.5 min-w-0">
                  <UserCog className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <SelectValue placeholder="Stage" />
                </div>
              </SelectTrigger>
              <SelectContent>
                {VIEWER_STAGES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="h-9"
              disabled={!canLoad}
              onClick={() => { setScopeLoaded(true); }}
            >
              Load Scope
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">{activeFilterCount}</Badge>
              )}
            </Button>
            {scopeLoaded && (
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                onClick={() => snapshot.refetch()}
                disabled={snapshot.isFetching}
                title="Refresh"
                aria-label="Refresh snapshot"
              >
                <RefreshCw className={`h-4 w-4 ${snapshot.isFetching ? 'animate-spin' : ''}`} />
              </Button>
            )}
          </div>
        </div>

        {/* Row 2 — single-row filter bar; horizontal scroll when overflow */}
        <div className="flex items-stretch gap-2 px-2 sm:px-4 h-11 bg-muted/30">
          <div className="matrix-scroll flex flex-nowrap items-center gap-2 flex-1 min-w-0 overflow-x-auto">
            {/* Month */}
            <Select value={period} onValueChange={(v) => { setPeriod(v); invalidateScope(); }}>
              <SelectTrigger className="h-8 w-[120px] shrink-0 text-xs" aria-label="Month">
                <div className="flex items-center gap-1.5 min-w-0 truncate">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <SelectValue placeholder="Month" />
                </div>
              </SelectTrigger>
              <SelectContent>
                {PERIOD_OPTIONS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>

            {/* Year */}
            <div className="relative shrink-0 w-[100px]">
              <CalendarDays className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                type="number"
                value={year}
                onChange={(e) => { setYear(Number(e.target.value) || defaultYear); invalidateScope(); }}
                className="h-8 w-full pl-7 text-xs"
                aria-label="Year"
              />
            </div>

            {/* Company */}
            {companies.length > 1 && (
              <MultiSelectFilter
                icon={<Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                label="Companies"
                width={160}
                values={companyIds}
                onChange={(v) => { setCompanyIds(v); invalidateScope(); }}
                options={companies.map(c => ({ value: c.id, label: c.name }))}
              />
            )}

            {/* Division */}
            <MultiSelectFilter
              icon={<Network className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
              label="Divisions"
              width={160}
              values={divisionIds}
              onChange={(v) => {
                setDivisionIds(v);
                setBusinessUnitIds([]); setDepartmentIds([]);
                invalidateScope();
              }}
              options={(divisions ?? []).map((d: any) => ({ value: d.id, label: d.name }))}
            />

            {/* Business Unit */}
            <MultiSelectFilter
              icon={<Factory className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
              label="BU"
              width={160}
              values={businessUnitIds}
              onChange={(v) => {
                setBusinessUnitIds(v); setDepartmentIds([]); invalidateScope();
              }}
              options={filteredBusinessUnits.map((b: any) => ({ value: b.id, label: b.name }))}
            />

            {/* Department */}
            <MultiSelectFilter
              icon={<Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
              label="Departments"
              width={180}
              values={departmentIds}
              onChange={(v) => { setDepartmentIds(v); invalidateScope(); }}
              options={filteredDepartments.map((d: any) => ({ value: d.id, label: d.name }))}
            />

            {/* Category */}
            <MultiSelectFilter
              icon={<Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
              label="Categories"
              width={170}
              values={categoryIds}
              onChange={(v) => { setCategoryIds(v); invalidateScope(); }}
              options={(categories ?? []).map((c: any) => ({ value: c.id, label: c.name }))}
            />

            {/* KRA — cascades from Category; client-side filter on accumulated snapshot */}
            <MultiSelectFilter
              icon={<Target className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
              label="KRAs"
              width={180}
              values={kraNames}
              onChange={setKraNames}
              options={kraOptionList.map((name) => ({ value: name, label: name }))}
              disabled={!scopeLoaded}
              title={scopeLoaded ? undefined : 'Load scope to see KRAs'}
              emptyText="No KRAs in loaded scope"
            />
          </div>

          {/* View-mode pill — outside grid, anchored right */}
          <div className="flex items-center gap-1 rounded-md border bg-background p-0.5 shrink-0 self-center ml-2 pl-2 border-l border-border/50">
            <ToggleGroup
              type="single"
              value={displayMode}
              onValueChange={(v) => v && setDisplayMode(v as 'score' | 'wt' | 'both')}
              className="h-7"
            >
              <ToggleGroupItem value="wt" className="h-7 px-2 text-[11px]">Wt%</ToggleGroupItem>
              <ToggleGroupItem value="score" className="h-7 px-2 text-[11px]">Score</ToggleGroupItem>
              <ToggleGroupItem value="both" className="h-7 px-2 text-[11px]">Both</ToggleGroupItem>
            </ToggleGroup>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setHideEmpty(v => !v)}
              aria-pressed={hideEmpty}
              aria-label={hideEmpty ? 'Show all rows' : 'Hide unscored rows'}
              title={hideEmpty ? 'Show all rows' : 'Hide unscored rows'}
            >
              {hideEmpty ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            </Button>
          </div>
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
                    isOrgByKpiId={isOrgByKpiId}
                  />
              )}

              {/* Snapshot loads every page on Load Scope; employees scroll
                  horizontally with the KPI/KRA column frozen on the left. */}

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
