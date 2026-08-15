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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ReviewPeriodSelector } from '@/components/ui/ReviewPeriodSelector';
import { OrgFilterCombobox } from '@/components/admin/OrgFilterCombobox';
import { useBusinessUnits, useDepartments } from '@/hooks/useOrganization';
import {
  useBuConsoleFlag,
  useBuConsoleTree,
  type BuConsoleScope,
  type KpiDetailArgs,
} from '@/hooks/useBuConsole';
import { BuConsoleTree } from '@/components/admin/bu-console/BuConsoleTree';
import { KpiDetailDrawer } from '@/components/admin/bu-console/KpiDetailDrawer';
import { MergeProposalsTab } from '@/components/admin/bu-console/MergeProposalsTab';
import { GoalsTab } from '@/components/admin/bu-console/GoalsTab';
import { FlaskConical, RefreshCw } from 'lucide-react';

export default function BuConsole() {
  const { data: flagEnabled, isLoading: flagLoading } = useBuConsoleFlag();

  const [period, setPeriod] = useState(() => format(new Date(), 'MMMM'));
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [buIds, setBuIds] = useState<string[]>([]);
  const [deptIds, setDeptIds] = useState<string[]>([]);
  const [scope, setScope] = useState<BuConsoleScope | null>(null);

  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [kraKey, setKraKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<KpiDetailArgs | null>(null);

  const { data: businessUnits } = useBusinessUnits();
  const { data: departments } = useDepartments();

  const buOptions = useMemo(
    () => (businessUnits ?? []).map((b: any) => ({ value: b.id, label: b.name })),
    [businessUnits],
  );

  // Cascading: department options narrow to the selected BUs (ADR-229).
  const deptOptions = useMemo(() => {
    const list = (departments ?? []).filter((d: any) =>
      buIds.length === 0 ? true : buIds.includes(d.business_unit_id),
    );
    return list.map((d: any) => ({
      value: d.id,
      label: d.business_units?.name ? `${d.name} — ${d.business_units.name}` : d.name,
    }));
  }, [departments, buIds]);

  const { data: tree, isFetching, refetch } = useBuConsoleTree(scope);

  const applyScope = () => {
    setCategoryId(null);
    setKraKey(null);
    setDetail(null);
    setScope({ period, year, buIds, deptIds });
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
    <div className="space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            BU Performance Console
            <Badge variant="secondary">Beta</Badge>
          </h1>
          <p className="text-sm text-muted-foreground">
            Review performance by KPI group instead of employee by employee. Read-only preview.
          </p>
        </div>
        {scope && (
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        )}
      </header>

      <Tabs defaultValue="console">
        <TabsList>
          <TabsTrigger value="console">Console</TabsTrigger>
          <TabsTrigger value="goals">Goals</TabsTrigger>
          <TabsTrigger value="library">KPI Library</TabsTrigger>
        </TabsList>

        <TabsContent value="console" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Scope</CardTitle>
              <CardDescription>
                Nothing loads until you apply a scope — this keeps large BUs responsive.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ReviewPeriodSelector
                selectedPeriod={period}
                selectedYear={year}
                onPeriodChange={setPeriod}
                onYearChange={setYear}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <OrgFilterCombobox
                  multiSelect
                  label="Business Units"
                  values={buIds}
                  onValuesChange={handleBuChange}
                  options={buOptions}
                  placeholder="All business units"
                />
                <OrgFilterCombobox
                  multiSelect
                  label="Departments"
                  values={deptIds}
                  onValuesChange={setDeptIds}
                  options={deptOptions}
                  placeholder="All departments"
                />
              </div>
              <Button onClick={applyScope} disabled={isFetching}>Load console</Button>
            </CardContent>
          </Card>

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
            <BuConsoleTree
              categories={tree.categories}
              selectedCategoryId={categoryId}
              selectedKraKey={kraKey}
              onSelectCategory={(id) => { setCategoryId(id); setKraKey(null); }}
              onSelectKra={setKraKey}
              onSelectKpi={(cId, kraName, kpiName) =>
                setDetail({ ...scope!, categoryId: cId, kraName, kpiName, page: 1 })
              }
            />
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
        onClose={() => setDetail(null)}
      />
    </div>
  );
}