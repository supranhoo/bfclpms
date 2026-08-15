/**
 * ADR-259/260 — BU Performance Console (Beta).
 *
 * Group-first view of the KPI landscape: pick a scope (period + BUs +
 * departments), drill Category → KRA → KPI, and inspect every employee mapped
 * to that KPI. Read-only in this phase — no scores are written from here.
 * Access is gated by the `feature_bu_console` admin flag.
 */
import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { ChevronRight, FlaskConical } from 'lucide-react';

export default function BuConsole() {
  const { data: flagEnabled, isLoading: flagLoading } = useBuConsoleFlag();

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
          <AlertTitle>BU Performance Console is switched off</AlertTitle>
          <AlertDescription>
            This beta is controlled by a feature switch. Turn on
            “BU Performance Console (Beta)” in Admin → Settings → Feature Flags to use it.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4 sm:p-6">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="flex items-center gap-2 text-xl font-semibold sm:text-2xl">
          BU Performance Console
          <Badge variant="secondary">Beta</Badge>
        </h1>
        <p className="text-sm text-muted-foreground">
          Review performance by KPI group instead of employee by employee.
        </p>
      </header>

      <Tabs defaultValue="console">
        <TabsList>
          <TabsTrigger value="console">Console</TabsTrigger>
          <TabsTrigger value="goals">Goals</TabsTrigger>
          <TabsTrigger value="library">KPI Library</TabsTrigger>
        </TabsList>

        <TabsContent value="console" className="mt-3 space-y-3">
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
            hint={!scope ? 'Nothing loads until you apply a scope — this keeps large BUs responsive.' : undefined}
          />

          {scope && (
            <nav aria-label="Console drilldown" className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              <span>{scope.period} {scope.year}</span>
              {selectedCategoryName && (
                <>
                  <ChevronRight className="h-3 w-3" />
                  <button type="button" className="hover:text-foreground" onClick={() => setKraKey(null)}>
                    {selectedCategoryName}
                  </button>
                </>
              )}
              {kraKey && selectedKraName && (
                <>
                  <ChevronRight className="h-3 w-3" />
                  <span className="text-foreground">{selectedKraName}</span>
                </>
              )}
            </nav>
          )}

          {isFetching && (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
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
        </TabsContent>

        <TabsContent value="library" className="mt-4">
          <MergeProposalsTab />
        </TabsContent>

        <TabsContent value="goals" className="mt-4">
          <GoalsTab
            active={!!scope}
            year={scope?.year ?? year}
            period={scope?.period ?? period}
            buIds={scope?.buIds ?? []}
            deptIds={scope?.deptIds ?? []}
            buOptions={buOptions}
            deptOptions={deptOptions}
          />
        </TabsContent>
      </Tabs>

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