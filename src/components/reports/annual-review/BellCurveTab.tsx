import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Download, FileText, Loader2, Settings2, Lightbulb } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { fetchComprehensiveReport, type ComprehensiveRow } from '@/services/annualReview/comprehensiveReport';
import {
  computeDistribution,
  computeSummary,
  groupDistribution,
  heatmapMatrix,
  normalizationHints,
  type BellCurveInput,
  type GroupKey,
} from '@/lib/annualReview/bellCurve';
import { useBellCurveConfig } from '@/hooks/useBellCurveConfig';
import { BellCurveChart } from './bellCurve/BellCurveChart';
import { DistributionBarChart } from './bellCurve/DistributionBarChart';
import { VarianceTable } from './bellCurve/VarianceTable';
import { RatingHeatmap } from './bellCurve/RatingHeatmap';
import { ComplianceChip } from './bellCurve/ComplianceChip';
import { BellCurveConfigDialog } from './bellCurve/BellCurveConfigDialog';
import { exportBellCurveExcel, exportBellCurvePdf } from './bellCurve/bellCurveExport';

const ALL = '__all__';

function KpiCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold tabular-nums">{value}</p>
        {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
      </CardContent>
    </Card>
  );
}

/**
 * ADR-218 / POLICY §AR-BELL-CURVE — on-screen Bell Curve Analysis for the
 * Annual Review Report. Reuses the comprehensive report dataset; the report's
 * own Excel download is unchanged (exports here are Bell Curve specific).
 */
export function BellCurveTab({ cycleId, cycleName }: { cycleId?: string; cycleName: string }) {
  const { effectiveRole, user } = useAuth();
  const canConfigure = effectiveRole === 'admin' || effectiveRole === 'hr_pms';
  const isManagerScope = effectiveRole === 'manager' || effectiveRole === 'skip_level';

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['annual-review-comprehensive', cycleId],
    queryFn: () => fetchComprehensiveReport(cycleId!),
    enabled: Boolean(cycleId),
    staleTime: 60_000,
  });
  const { data: config } = useBellCurveConfig(cycleId);

  const [view, setView] = useState<GroupKey>('department');
  const [bu, setBu] = useState(ALL);
  const [dept, setDept] = useState(ALL);
  const [manager, setManager] = useState(ALL);
  const [division, setDivision] = useState(ALL);
  const [pmsGrade, setPmsGrade] = useState(ALL);
  const [configOpen, setConfigOpen] = useState(false);
  // Multi-select drill-down on the heat map, per grouping view.
  const [groupSel, setGroupSel] = useState<Record<GroupKey, string[]>>({
    department: [], business_unit: [], division: [], manager: [],
  });
  const selectedIds = groupSel[view];

  const options = useMemo(() => {
    const pick = (get: (r: ComprehensiveRow) => [string | null, string | null]) => {
      const map = new Map<string, string>();
      for (const r of rows) {
        const [id, name] = get(r);
        if (id) map.set(id, name ?? 'Unnamed');
      }
      return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
    };
    return {
      bu: pick((r) => [r.business_unit_id, r.business_unit_name]),
      dept: pick((r) => [r.department_id, r.department_name]),
      manager: pick((r) => [r.manager_id, r.manager_name]),
      division: pick((r) => [r.division_id, r.division_name]),
      grade: pick((r) => [r.grade, r.grade]),
    };
  }, [rows]);

  const filtered = useMemo<BellCurveInput[]>(() => {
    let base = rows as BellCurveInput[];
    // Managers and skip-level reviewers only ever see their own team.
    if (isManagerScope && user?.id) {
      base = base.filter((r) => r.manager_id === user.id);
    }
    return base.filter((r) =>
      (bu === ALL || r.business_unit_id === bu)
      && (dept === ALL || r.department_id === dept)
      && (manager === ALL || r.manager_id === manager)
      && (division === ALL || r.division_id === division)
      && (pmsGrade === ALL || r.grade === pmsGrade));
  }, [rows, isManagerScope, user?.id, bu, dept, manager, division, pmsGrade]);

  // Heat map always lists every group in the filtered set; the selection
  // narrows the charts, KPIs and exports only.
  const scoped = useMemo<BellCurveInput[]>(() => {
    if (selectedIds.length === 0) return filtered;
    const set = new Set(selectedIds);
    return filtered.filter((r) => {
      const id = view === 'department' ? r.department_id
        : view === 'business_unit' ? r.business_unit_id
          : view === 'division' ? r.division_id : r.manager_id;
      return id ? set.has(id) : false;
    });
  }, [filtered, selectedIds, view]);

  const bands = useMemo(() => (config ? computeDistribution(scoped, config) : []), [scoped, config]);
  const summary = useMemo(() => (config ? computeSummary(scoped, config) : null), [scoped, config]);
  const groups = useMemo(() => (config ? groupDistribution(scoped, view, config) : []), [scoped, view, config]);
  const heat = useMemo(() => (config ? heatmapMatrix(filtered, view, config) : []), [filtered, view, config]);
  const hints = useMemo(() => (config ? normalizationHints(bands, config) : []), [bands, config]);

  if (!cycleId) {
    return <Card><CardContent className="p-8 text-center text-muted-foreground">Pick a cycle to view the bell curve.</CardContent></Card>;
  }
  if (isLoading || !config || !summary) {
    return <Card><CardContent className="p-8 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading distribution…</CardContent></Card>;
  }

  const viewLabel = view === 'department' ? 'Department'
    : view === 'business_unit' ? 'Business Unit'
      : view === 'division' ? 'Division' : 'Manager';

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-3">
          <div>
            <CardTitle className="text-base">Bell Curve Analysis</CardTitle>
            <CardDescription>
              Target {config.target_5}/{config.target_4}/{config.target_3}/{config.target_2}/{config.target_1}% ·
              green ±{config.green_threshold}% · amber ±{config.amber_threshold}%
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {canConfigure && (
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setConfigOpen(true)}>
                <Settings2 className="h-4 w-4" /> Configure targets
              </Button>
            )}
            <Button
              variant="outline" size="sm" className="gap-2"
              disabled={scoped.length === 0}
              onClick={() => exportBellCurveExcel(scoped, config, cycleName).catch((e) => toast.error((e as Error).message))}
            >
              <Download className="h-4 w-4" /> Excel
            </Button>
            <Button
              variant="outline" size="sm" className="gap-2"
              disabled={scoped.length === 0}
              onClick={() => exportBellCurvePdf(scoped, config, cycleName).catch((e) => toast.error((e as Error).message))}
            >
              <FileText className="h-4 w-4" /> PDF
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Tabs value={view} onValueChange={(v) => setView(v as GroupKey)}>
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="department">Department</TabsTrigger>
              <TabsTrigger value="business_unit">Business Unit</TabsTrigger>
              <TabsTrigger value="division">Division</TabsTrigger>
              <TabsTrigger value="manager">Manager</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {([
              ['Business Unit', bu, setBu, options.bu],
              ['Department', dept, setDept, options.dept],
              ['Manager', manager, setManager, options.manager],
              ['Division / Location', division, setDivision, options.division],
            ] as const).map(([label, value, setter, opts]) => (
              <div key={label} className="space-y-1">
                <Label className="text-xs">{label}</Label>
                <Select value={value} onValueChange={(v) => setter(v)}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All</SelectItem>
                    {opts.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard label="Total Employees" value={summary.totalEmployees} hint={`${summary.unratedEmployees} unrated`} />
        <KpiCard label="Average Rating" value={summary.averageRating !== null ? summary.averageRating.toFixed(2) : '—'} hint="out of 5" />
        <KpiCard label="Highest Rating Count" value={summary.highestBandCount} hint="Outstanding (5)" />
        <KpiCard label="Lowest Rating Count" value={summary.lowestBandCount} hint="Unsatisfactory (1)" />
        <KpiCard label="Bell Curve Compliance" value={`${summary.compliancePct}%`} hint={`${summary.greenBands} green · ${summary.amberBands} amber · ${summary.redBands} red`} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <BellCurveChart bands={bands} config={config} denom={summary.ratedEmployees} />
        <DistributionBarChart bands={bands} />
      </div>

      <VarianceTable bands={bands} />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Lightbulb className="h-4 w-4" /> Normalization recommendations</CardTitle>
          <CardDescription>Bands outside the configured threshold for the current selection</CardDescription>
        </CardHeader>
        <CardContent>
          {hints.length === 0 ? (
            <p className="text-sm text-muted-foreground">Distribution is within the bell curve threshold — no action needed.</p>
          ) : (
            <ul className="space-y-2">
              {hints.map((h) => (
                <li key={`${h.band}-${h.direction}`} className="flex items-start gap-2 text-sm">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${h.direction === 'over' ? 'bg-rose-500' : 'bg-amber-500'}`} />
                  {h.message}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <RatingHeatmap
        rows={heat}
        title={viewLabel}
        selectedIds={selectedIds}
        onToggle={(id) => setGroupSel((s) => ({
          ...s,
          [view]: s[view].includes(id) ? s[view].filter((x) => x !== id) : [...s[view], id],
        }))}
        onSelectAll={(ids) => setGroupSel((s) => ({ ...s, [view]: ids }))}
        onClearSelection={() => setGroupSel((s) => ({ ...s, [view]: [] }))}
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{viewLabel} compliance</CardTitle>
          <CardDescription>Consolidated view for the selected grouping</CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="p-3 text-left font-medium">{viewLabel}</th>
                <th className="p-3 text-right font-medium">Rated</th>
                <th className="p-3 text-right font-medium">Avg rating</th>
                <th className="p-3 text-right font-medium">Compliance %</th>
                <th className="p-3 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.id} className="border-b last:border-0">
                  <td className="p-3 font-medium">{g.name}</td>
                  <td className="p-3 text-right tabular-nums">{g.summary.ratedEmployees}</td>
                  <td className="p-3 text-right tabular-nums">{g.summary.averageRating?.toFixed(2) ?? '—'}</td>
                  <td className="p-3 text-right tabular-nums">{g.summary.compliancePct}%</td>
                  <td className="p-3"><ComplianceChip level={g.worstCompliance} /></td>
                </tr>
              ))}
              {groups.length === 0 && (
                <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No data for the current filters.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <BellCurveConfigDialog
        open={configOpen}
        onOpenChange={setConfigOpen}
        config={config}
        cycleId={cycleId}
        cycleName={cycleName}
      />
    </div>
  );
}