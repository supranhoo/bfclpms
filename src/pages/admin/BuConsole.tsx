/**
 * ADR-259/260 — BU Performance Console (Beta).
 * ADR-289 — one surface, no tabs.
 *
 * Group-first view of the KPI landscape: pick a scope (period + BUs +
 * departments), drill Category → KRA → KPI, and inspect every employee mapped
 * to that KPI. The same surface runs the review: switch to Review mode and the
 * expanded KRA becomes a KPI x employee worksheet with an audited batch move.
 * Alignment (KRA tree) and the KPI library are dialogs off this page, not tabs.
 * Access is gated by the `feature_bu_console` admin flag.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { OrgFilterCombobox } from '@/components/admin/OrgFilterCombobox';
import { useBusinessUnits, useDepartments, useDivisions } from '@/hooks/useOrganization';
import { useManagers } from '@/hooks/useKpiFilters';
import {
  useBuConsoleFlag,
  useBuConsoleTree,
  type BuConsoleScope,
  type KpiDetailArgs,
} from '@/hooks/useBuConsole';
import { BuConsoleTree } from '@/components/admin/bu-console/BuConsoleTree';
import { ScopeToolbar } from '@/components/admin/bu-console/ScopeToolbar';
import { KpiDetailDrawer } from '@/components/admin/bu-console/KpiDetailDrawer';
import { MergeProposalsTab } from '@/components/admin/bu-console/MergeProposalsTab';
import { GoalsTab } from '@/components/admin/bu-console/GoalsTab';
import { StageRail } from '@/components/admin/bu-console/StageRail';
import { KraWorksheet } from '@/components/admin/bu-console/KraWorksheet';
import { useBuConsoleCapability } from '@/hooks/useBuConsoleCapability';
import {
  ConsoleStatBand,
  computeConsoleStats,
} from '@/components/admin/bu-console/ConsoleStatBand';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ChevronRight, FlaskConical, Compass, MoreHorizontal, Network, Library } from 'lucide-react';

export default function BuConsole() {
  const { data: flagEnabled, isLoading: flagLoading } = useBuConsoleFlag();
  const { isReadOnly, isAdmin, canWrite } = useBuConsoleCapability();

  const [period, setPeriod] = useState(() => format(new Date(), 'MMMM'));
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [buIds, setBuIds] = useState<string[]>([]);
  const [deptIds, setDeptIds] = useState<string[]>([]);
  const [divisionIds, setDivisionIds] = useState<string[]>([]);
  const [managerIds, setManagerIds] = useState<string[]>([]);
  const [scope, setScope] = useState<BuConsoleScope | null>(null);

  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [kraKey, setKraKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<KpiDetailArgs | null>(null);

  // ADR-294 — one console: configuration and review live on the same surface.
  // Write actions stay gated by capability, so non-admins simply see it read-only.
  const [stage, setStage] = useState('manager_check');
  // ADR-296 — hide KPIs whose frequency cycle is not open for the selected month.
  const [dueOnly, setDueOnly] = useState(false);
  const [alignmentOpen, setAlignmentOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);

  const { data: businessUnits } = useBusinessUnits();
  const { data: departments } = useDepartments();
  const { data: divisions } = useDivisions();
  const managers = useManagers();

  const divisionOptions = useMemo(
    () => (divisions ?? []).map((d: any) => ({ value: d.id, label: d.name })),
    [divisions],
  );

  // Cascading: BU options narrow to the selected divisions (ADR-229).
  const buOptions = useMemo(
    () =>
      (businessUnits ?? [])
        .filter((b: any) => divisionIds.length === 0 || divisionIds.includes(b.division_id))
        .map((b: any) => ({ value: b.id, label: b.name })),
    [businessUnits, divisionIds],
  );

  // Cascading: department options narrow to the selected BUs (ADR-229).
  const deptOptions = useMemo(() => {
    const allowedBuIds = new Set(buOptions.map(o => o.value));
    const list = (departments ?? []).filter((d: any) => {
      if (buIds.length > 0) return buIds.includes(d.business_unit_id);
      return divisionIds.length === 0 || allowedBuIds.has(d.business_unit_id);
    });
    return list.map((d: any) => ({
      value: d.id,
      label: d.business_units?.name ? `${d.name} — ${d.business_units.name}` : d.name,
    }));
  }, [departments, buIds, divisionIds, buOptions]);

  // Cascading: manager options narrow to the selected division / BU / department.
  const managerOptions = useMemo(() => {
    const allowedBuIds = new Set(buOptions.map(o => o.value));
    return (managers ?? [])
      .filter((m: any) => {
        if (deptIds.length > 0) return deptIds.includes(m.department_id);
        if (buIds.length > 0) return buIds.includes(m.business_unit_id);
        if (divisionIds.length > 0) return allowedBuIds.has(m.business_unit_id);
        return true;
      })
      .map((m: any) => ({
        value: m.id,
        label: m.employee_code ? `${m.full_name} (${m.employee_code})` : m.full_name,
      }));
  }, [managers, deptIds, buIds, divisionIds, buOptions]);

  const { data: tree, isFetching, refetch } = useBuConsoleTree(scope);
  const navigate = useNavigate();

  // ADR-271 — filter selections are only committed on apply; surface the gap
  // instead of letting stale category counts look current.
  const sameIds = (a: string[], b: string[]) =>
    a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');
  const scopeDirty = !!scope && !(
    scope.period === period &&
    scope.year === year &&
    sameIds(scope.buIds, buIds) &&
    sameIds(scope.deptIds, deptIds) &&
    sameIds(scope.divisionIds, divisionIds) &&
    sameIds(scope.managerIds, managerIds)
  );

  const selectedCategory = useMemo(
    () => tree?.categories.find(c => c.category_id === categoryId) ?? null,
    [tree, categoryId],
  );
  const selectedCategoryName = selectedCategory?.category_name ?? null;
  const selectedKraName =
    selectedCategory?.kras.find(k => k.kra_key === kraKey)?.kra_name ?? null;

  // ADR-279 — stat band derives from the already-fetched tree; no extra reads.
  const stats = useMemo(
    () => (tree?.authorized ? computeConsoleStats(tree.categories, tree.employee_total) : null),
    [tree],
  );

  // Human-readable summary of the loaded scope (presentation only).
  const scopeSummary = useMemo(() => {
    if (!scope) return '';
    const nameOf = (ids: string[], opts: { value: string; label: string }[], allLabel: string) =>
      ids.length === 0
        ? allLabel
        : ids.length === 1
          ? (opts.find(o => o.value === ids[0])?.label ?? allLabel)
          : `${ids.length} ${allLabel.replace(/^all /i, '')}`;
    return [
      nameOf(scope.divisionIds, divisionOptions, 'all divisions'),
      nameOf(scope.buIds, buOptions, 'all business units'),
      nameOf(scope.deptIds, deptOptions, 'all departments'),
      nameOf(scope.managerIds, managerOptions, 'all managers'),
    ].join(' · ');
  }, [scope, divisionOptions, buOptions, deptOptions, managerOptions]);

  const applyScope = () => {
    setCategoryId(null);
    setKraKey(null);
    setDetail(null);
    setScope({ period, year, buIds, deptIds, divisionIds, managerIds });
  };

  const handleDivisionChange = (values: string[]) => {
    setDivisionIds(values);
    const allowedBuIds = new Set(
      (businessUnits ?? [])
        .filter((b: any) => values.length === 0 || values.includes(b.division_id))
        .map((b: any) => b.id),
    );
    // Drop BUs / departments / managers that fall outside the selected divisions.
    setBuIds(prev => prev.filter(id => values.length === 0 || allowedBuIds.has(id)));
    setDeptIds(prev =>
      prev.filter(id => {
        const d = (departments ?? []).find((x: any) => x.id === id) as any;
        return !d || values.length === 0 || allowedBuIds.has(d.business_unit_id);
      }),
    );
    setManagerIds(prev =>
      prev.filter(id => {
        const m = (managers ?? []).find((x: any) => x.id === id) as any;
        return !m || values.length === 0 || allowedBuIds.has(m.business_unit_id);
      }),
    );
  };

  const handleBuChange = (values: string[]) => {
    setBuIds(values);
    // Drop departments that no longer belong to the selected BUs.
    setDeptIds(prev =>
      prev.filter(id => {
        const d = (departments ?? []).find((x: any) => x.id === id) as any;
        return !d || values.length === 0 || values.includes(d.business_unit_id);
      }),
    );
    setManagerIds(prev =>
      prev.filter(id => {
        const m = (managers ?? []).find((x: any) => x.id === id) as any;
        return !m || values.length === 0 || values.includes(m.business_unit_id);
      }),
    );
  };

  const handleDeptChange = (values: string[]) => {
    setDeptIds(values);
    setManagerIds(prev =>
      prev.filter(id => {
        const m = (managers ?? []).find((x: any) => x.id === id) as any;
        return !m || values.length === 0 || values.includes(m.department_id);
      }),
    );
  };

  if (flagLoading) {
    return <div className="p-6 space-y-3"><Skeleton className="h-8 w-64" /><Skeleton className="h-40 w-full" /></div>;
  }

  if (!flagEnabled) {
    return (
      <div className="p-6">
        <Alert>
          <FlaskConical className="h-4 w-4" />
          <AlertTitle>Performance Console is switched off</AlertTitle>
          <AlertDescription>
            This beta is controlled by a feature switch. Turn on
            “Performance Console (Beta)” in Admin → Settings → Feature Flags to use it.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-2 p-3 sm:p-4">
      {/* ADR-283/289 — title, mode switch and the scope metrics share one block. */}
      <header className="rounded-lg border bg-card px-3 py-2 sm:px-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="flex items-center gap-2 text-base font-semibold tracking-tight sm:text-lg">
              Performance Console
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="secondary" className="cursor-help">Beta</Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    Review performance by KPI group instead of employee by employee.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </h1>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="ml-auto h-8 w-8" aria-label="More console tools">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setAlignmentOpen(true)}>
                  <Network className="mr-2 h-4 w-4" />
                  KRA alignment tree
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setLibraryOpen(true)}>
                  <Library className="mr-2 h-4 w-4" />
                  KPI library &amp; duplicates
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {isReadOnly && (
            <p className="mt-2 rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-[11px] text-muted-foreground">
              Read-only view — you can explore every scope, but group edits, tuning and approvals
              stay with admins.
            </p>
          )}
          {canWrite && !isAdmin && (
            <p className="mt-2 rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-[11px] text-muted-foreground">
              You can act on KPIs that have left KRA Set. KRA design — while a KPI is still in KRA
              Set — stays with admins.
            </p>
          )}
          {scope && stats && (
            <div className="mt-2 border-t pt-2">
              <ConsoleStatBand stats={stats} scopeLabel={`${scope.period} ${scope.year} · ${scopeSummary}`} />
            </div>
          )}
      </header>

      <div className="mt-2 space-y-2">
          <ScopeToolbar
            period={period}
            year={year}
            onPeriodChange={setPeriod}
            onYearChange={setYear}
            filters={[
              { key: 'div', label: 'Divisions', placeholder: 'All divisions', values: divisionIds, onValuesChange: handleDivisionChange, options: divisionOptions },
              { key: 'bu', label: 'Business Units', placeholder: 'All business units', values: buIds, onValuesChange: handleBuChange, options: buOptions },
              { key: 'dept', label: 'Departments', placeholder: 'All departments', values: deptIds, onValuesChange: handleDeptChange, options: deptOptions },
              { key: 'mgr', label: 'Managers', placeholder: 'All managers', values: managerIds, onValuesChange: setManagerIds, options: managerOptions },
            ]}
            onApply={applyScope}
            onRefresh={() => refetch()}
            isBusy={isFetching}
            hasScope={!!scope}
            isDirty={scopeDirty}
            summary={scope ? `${scope.period} ${scope.year} · ${scopeSummary}` : undefined}
            hint={!scope ? 'Nothing loads until you apply a scope — this keeps large BUs responsive.' : undefined}
          />

          {/* ADR-289 — the pipeline is a rail on this surface, not a tab. It also
              picks the stage the inline worksheet works at. */}
          {scope && <StageRail scope={scope} stage={stage} onStageChange={setStage} />}

          {scope && (
            <div className="flex items-center justify-end gap-2 rounded-lg border bg-card px-3 py-1.5">
              <Label htmlFor="console-due-only" className="text-xs text-muted-foreground">
                Due this month only
              </Label>
              <Switch
                id="console-due-only"
                checked={dueOnly}
                onCheckedChange={setDueOnly}
                aria-label="Show only KPIs open for data submission in the selected month"
              />
            </div>
          )}

          {!scope && !isFetching && (
            <>
              <ConsoleStatBand placeholder variant="tiles" />
              <div className="rounded-lg border border-dashed px-6 py-12 text-center">
              <Compass className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">Pick a scope to load the console</p>
              <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                Choose a review period and, optionally, divisions, business units, departments or
                managers — then load the console. Nothing is fetched until you do, which keeps
                large business units responsive.
              </p>
              </div>
            </>
          )}

          {isFetching && (
            <div className="space-y-3">
              <Skeleton className="h-[74px] w-full rounded-lg" />
              <Skeleton className="h-[56px] w-full rounded-lg" />
              <div className="space-y-px overflow-hidden rounded-lg border">
                <Skeleton className="h-8 w-full rounded-none" />
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-none" />
                ))}
              </div>
            </div>
          )}

          {tree && !tree.authorized && (
            <Alert variant="destructive">
              <AlertTitle>Access denied</AlertTitle>
              <AlertDescription>You do not have permission to open this console.</AlertDescription>
            </Alert>
          )}

          {tree?.authorized && !isFetching && (
            <div className={scopeDirty ? 'opacity-60 transition-opacity' : undefined} aria-busy={scopeDirty}>
            <BuConsoleTree
              categories={tree.categories}
              selectedCategoryId={categoryId}
              selectedKraKey={kraKey}
              period={scope?.period}
              year={scope?.year}
              dueOnly={dueOnly}
              renderKraPanel={
                scope
                  ? (kra, cId) => (
                      <KraWorksheet
                        scope={scope}
                        categoryId={cId}
                        kraName={kra.kra_name}
                        stage={stage}
                      />
                    )
                  : undefined
              }
              kraPanelPlacement="append"
              breadcrumb={
                <nav
                  aria-label="Console drilldown"
                  className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground"
                >
                  <span className="truncate">{scope?.period} {scope?.year} · {scopeSummary}</span>
                  {selectedCategoryName && (
                    <>
                      <ChevronRight className="h-3 w-3 shrink-0" />
                      <button
                        type="button"
                        className="truncate hover:text-foreground"
                        onClick={() => setKraKey(null)}
                      >
                        {selectedCategoryName}
                      </button>
                    </>
                  )}
                  {kraKey && selectedKraName && (
                    <>
                      <ChevronRight className="h-3 w-3 shrink-0" />
                      <span className="truncate text-foreground">{selectedKraName}</span>
                    </>
                  )}
                </nav>
              }
              onFixTextSplit={(kpi) =>
                navigate(
                  `/admin/kpi-standardization?tab=split&q=${encodeURIComponent(kpi.kpi_name)}`,
                )
              }
              onSelectCategory={(id) => { setCategoryId(id); setKraKey(null); }}
              onSelectKra={setKraKey}
              onSelectKpi={(cId, kraName, kpi, variantKey) =>
                setDetail({
                  ...scope!,
                  categoryId: cId,
                  kraName,
                  kpiName: kpi.kpi_name,
                  titleKey: kpi.title_key,
                  kpiTitle: kpi.kpi_title,
                  variantKey: variantKey ?? null,
                  page: 1,
                })
              }
            />
            </div>
          )}
      </div>

      {/* ADR-289 — alignment and library are tools off the console, not tabs. */}
      <Dialog open={alignmentOpen} onOpenChange={setAlignmentOpen}>
        <DialogContent className="max-w-[1180px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>KRA alignment tree</DialogTitle>
          </DialogHeader>
          <GoalsTab
            active={alignmentOpen}
            year={scope?.year ?? year}
            period={scope?.period ?? period}
            buIds={scope?.buIds ?? []}
            deptIds={scope?.deptIds ?? []}
            buOptions={buOptions}
            deptOptions={deptOptions}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={libraryOpen} onOpenChange={setLibraryOpen}>
        <DialogContent className="max-w-[1180px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>KPI library &amp; duplicates</DialogTitle>
          </DialogHeader>
          <MergeProposalsTab />
        </DialogContent>
      </Dialog>

      <KpiDetailDrawer
        args={detail}
        onPageChange={(page) => setDetail(d => (d ? { ...d, page } : d))}
        onSelectVariant={(variantKey) =>
          setDetail(d => (d ? { ...d, variantKey, page: 1 } : d))
        }
        onClose={() => setDetail(null)}
      />
    </div>
  );
}