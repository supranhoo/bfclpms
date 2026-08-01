import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { MultiSelectId } from '@/components/ui/multi-select-id';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Download, FileText, Loader2, Settings2, Lightbulb, Users, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { fetchComprehensiveReport, type ComprehensiveRow } from '@/services/annualReview/comprehensiveReport';
import {
  BAND_MODE_LABELS,
  computeBands,
  employeesInBand,
  groupBands,
  heatmapBands,
  makeBanding,
  normalizationHints,
  summarize,
  SCORING_SOURCE_LABELS,
  type BandMode,
  type BandRow,
  type BellCurveInput,
  type GroupKey,
  type ScoringSource,
} from '@/lib/annualReview/bellCurve';
import {
  allAxisOptions,
  axisSummary,
  emptyFilters,
  matchesFilters,
  reconcileFilters,
  type BellCurveFilters,
  type FilterAxis,
  type FilterOption,
} from '@/lib/annualReview/bellCurveFilters';
import { useBellCurveConfig } from '@/hooks/useBellCurveConfig';
import { useAnnualReviewRatingSlabs } from '@/hooks/useAnnualReviewRatingSlabs';
import { fetchTemplateEligibilityMaps } from '@/services/annualReview/eligibilityReportColumns';
import {
  resolveEligibility,
  type EffectiveEligibility, type EligibilityStatus,
} from '@/lib/annualReview/effectiveEligibility';
import {
  useEligibilityExemptionPolicy, useEligibilityExemptions,
} from '@/hooks/annualReview/useEligibilityExemptions';
import { BellCurveChart } from './bellCurve/BellCurveChart';
import { DistributionBarChart } from './bellCurve/DistributionBarChart';
import { VarianceTable } from './bellCurve/VarianceTable';
import { RatingHeatmap } from './bellCurve/RatingHeatmap';
import { BandEmployeeList } from './bellCurve/BandEmployeeList';
import { ComplianceChip } from './bellCurve/ComplianceChip';
import { BellCurveConfigDialog } from './bellCurve/BellCurveConfigDialog';
import { ExemptionPenaltyDialog } from './bellCurve/ExemptionPenaltyDialog';
import { BulkExemptionDialog } from './bellCurve/BulkExemptionDialog';
import { exportBellCurveExcel, exportBellCurvePdf } from './bellCurve/bellCurveExport';

const ALL = '__all__';

/** ADR-229 — label + axis for each cascading multi-select filter, in render order. */
const FILTER_FIELDS: ReadonlyArray<readonly [string, FilterAxis]> = [
  ['Business Unit', 'bu'],
  ['Department', 'dept'],
  ['Manager', 'manager'],
  ['Division / Location', 'division'],
  ['PMS Grade', 'grade'],
  ['Scoring Source (KRA)', 'scoringSource'],
  ['Eligibility', 'eligibility'],
];
const FILTER_AXES_ORDER = FILTER_FIELDS.map(([, axis]) => axis);

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
  // ADR-221 — who may request vs decide eligibility exemptions.
  const canApproveExemptions = effectiveRole === 'admin' || effectiveRole === 'hr_pms' || effectiveRole === 'management';
  const canManageExemptions = canApproveExemptions;
  const isManagerScope = effectiveRole === 'manager' || effectiveRole === 'skip_level';

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['annual-review-comprehensive', cycleId],
    queryFn: () => fetchComprehensiveReport(cycleId!),
    enabled: Boolean(cycleId),
    staleTime: 60_000,
  });
  const { data: config } = useBellCurveConfig(cycleId);
  const { data: slabs = [] } = useAnnualReviewRatingSlabs();
  // ADR-221 — eligibility criteria (per template), exemptions and master policy.
  const templateIds = useMemo(
    () => Array.from(new Set(rows.map((r) => r.template_id).filter(Boolean) as string[])),
    [rows],
  );
  const { data: eligMaps = {} } = useQuery({
    queryKey: ['ar-template-eligibility', templateIds.slice().sort().join(',')],
    enabled: templateIds.length > 0,
    staleTime: 5 * 60_000,
    queryFn: () => fetchTemplateEligibilityMaps(templateIds),
  });
  const { data: exemptions = {} } = useEligibilityExemptions(cycleId);
  const { data: exemptionPolicy = [] } = useEligibilityExemptionPolicy();

  const [view, setView] = useState<GroupKey>('department');
  const [bandMode, setBandMode] = useState<BandMode>('rating');
  // ADR-229 — every axis is multi-select; an empty array means "All".
  const [filters, setFilters] = useState<BellCurveFilters>(() => emptyFilters());
  const [configOpen, setConfigOpen] = useState(false);
  const [penaltyOpen, setPenaltyOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  // Multi-select drill-down on the heat map, per grouping view.
  const [groupSel, setGroupSel] = useState<Record<GroupKey, string[]>>({
    department: [], business_unit: [], division: [], manager: [],
  });
  const selectedIds = groupSel[view];

  /**
   * Eligibility-annotated, manager-scoped rows — the shared base for both the
   * filtered set and the cascading option lists (ADR-218i).
   */
  const baseRows = useMemo<BellCurveInput[]>(() => {
    let base: BellCurveInput[] = (rows as ComprehensiveRow[]).map((r) => {
      const res = resolveEligibility({
        criteria: r.template_id ? eligMaps[r.template_id] : undefined,
        inputs: r.eligibility_inputs ?? undefined,
        exemptions: exemptions[r.instance_id] ?? [],
        policy: exemptionPolicy,
      });
      return {
        ...(r as unknown as BellCurveInput),
        cycle_id: cycleId ?? null,
        eligibility_status: res.status,
        eligibility_pending: res.hasPendingExemption,
      };
    });
    // Managers and skip-level reviewers only ever see their own team.
    if (isManagerScope && user?.id) {
      base = base.filter((r) => r.manager_id === user.id);
    }
    return base;
  }, [rows, eligMaps, exemptions, exemptionPolicy, cycleId, isManagerScope, user?.id]);

  /** ADR-218i — each axis lists only values available under the other filters. */
  const options = useMemo(() => allAxisOptions(baseRows, filters), [baseRows, filters]);

  const setAxis = (axis: FilterAxis, values: string[]) =>
    setFilters((f) => ({ ...f, [axis]: values }));

  // Prune (never blanket-reset) selections that became impossible (ADR-229).
  useEffect(() => {
    const { filters: next, changed } = reconcileFilters(filters, options);
    if (changed.length === 0) return;
    setFilters(next);
    setGroupSel({ department: [], business_unit: [], division: [], manager: [] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, options]);

  const filtered = useMemo<BellCurveInput[]>(
    () => baseRows.filter((r) => matchesFilters(r, filters)),
    [baseRows, filters],
  );

  /** Full eligibility detail for the drill-down / exemption dialog. */
  const eligibilityByInstance = useMemo(() => {
    const map = new Map<string, EffectiveEligibility>();
    for (const r of rows as ComprehensiveRow[]) {
      map.set(r.instance_id, resolveEligibility({
        criteria: r.template_id ? eligMaps[r.template_id] : undefined,
        inputs: r.eligibility_inputs ?? undefined,
        exemptions: exemptions[r.instance_id] ?? [],
        policy: exemptionPolicy,
      }));
    }
    return map;
  }, [rows, eligMaps, exemptions, exemptionPolicy]);

  const eligibilityCounts = useMemo(() => {
    const c: Record<EligibilityStatus, number> = { eligible: 0, exempted: 0, ineligible: 0, unknown: 0 };
    for (const r of filtered) c[(r.eligibility_status ?? 'unknown')] += 1;
    return c;
  }, [filtered]);

  /** ADR-229 — export header lists the selected values of every axis. */
  const filterNote = useMemo(() => {
    const parts: string[] = [];
    for (const [label, axis] of FILTER_FIELDS) {
      parts.push(`${label}: ${axisSummary(filters[axis] ?? [], options[axis])}`);
    }
    return parts.join(' · ');
  }, [filters, options]);

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

  /** ADR-222/224 penalty settings — also drive ADR-228 band placement. */
  const capOptions = useMemo(() => (config ? {
    slabs: slabs.length > 0 ? slabs : undefined,
    capEnabled: config.exempted_slab_cap_enabled !== false,
    topTiersExcluded: config.exempted_top_tiers_excluded ?? 0,
    penalty: {
      mode: config.exempted_penalty_mode ?? 'top_tiers_excluded',
      stepDownSlabs: config.exempted_step_down_slabs ?? 1,
      topTiersExcluded: config.exempted_top_tiers_excluded ?? 0,
      scope: config.exempted_penalty_scope ?? 'all_slabs',
      topSlabs: config.exempted_penalty_top_slabs ?? 2,
      floorPercent: config.exempted_penalty_floor_percent ?? 0,
    },
  } : null), [config, slabs]);

  const banding = useMemo(
    () => (config && capOptions ? makeBanding(bandMode, config, slabs, capOptions) : null),
    [config, bandMode, slabs, capOptions],
  );
  const bands = useMemo(() => (config && banding ? computeBands(scoped, banding, config) : []), [scoped, banding, config]);
  const summary = useMemo(() => (config && banding ? summarize(scoped, banding, config) : null), [scoped, banding, config]);
  const groups = useMemo(() => (config && banding ? groupBands(scoped, view, banding, config) : []), [scoped, view, banding, config]);
  const heat = useMemo(() => (config && banding ? heatmapBands(filtered, view, banding, config) : []), [filtered, view, banding, config]);
  const hints = useMemo(
    () => (config && banding?.hasTargets ? normalizationHints(bands as BandRow[], config) : []),
    [bands, banding, config],
  );

  if (!cycleId) {
    return <Card><CardContent className="p-8 text-center text-muted-foreground">Pick a cycle to view the bell curve.</CardContent></Card>;
  }
  if (isLoading || !config || !summary || !banding || !capOptions) {
    return <Card><CardContent className="p-8 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading distribution…</CardContent></Card>;
  }

  const hasTargets = banding.hasTargets;
  const capNote = capOptions.capEnabled && (capOptions.topTiersExcluded ?? 0) > 0
    ? ` · Exempted: top ${capOptions.topTiersExcluded} tier(s) excluded`
    : '';
  const modeNote = `Bands: ${BAND_MODE_LABELS[bandMode]}${capNote}`;

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
              {hasTargets ? (
                <>
                  Target {config.target_5}/{config.target_4}/{config.target_3}/{config.target_2}/{config.target_1}% ·
                  green ±{config.green_threshold}% · amber ±{config.amber_threshold}%
                </>
              ) : (
                <>Grouped by increment slab (ADR-212) — no targets are defined for slab bands</>
              )}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {canConfigure && hasTargets && (
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setConfigOpen(true)}>
                <Settings2 className="h-4 w-4" /> Configure targets
              </Button>
            )}
            {canConfigure && !hasTargets && (
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setConfigOpen(true)}>
                <Settings2 className="h-4 w-4" /> Configure
              </Button>
            )}
            {canConfigure && (
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setPenaltyOpen(true)}>
                <SlidersHorizontal className="h-4 w-4" /> Exemption penalty
              </Button>
            )}
            {canManageExemptions && (
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setBulkOpen(true)}>
                <Users className="h-4 w-4" /> Bulk exempt
              </Button>
            )}
            <Button
              variant="outline" size="sm" className="gap-2"
              disabled={scoped.length === 0}
              onClick={() => exportBellCurveExcel(scoped, config, cycleName, `${filterNote} · ${modeNote}`, banding, capOptions).catch((e) => toast.error((e as Error).message))}
            >
              <Download className="h-4 w-4" /> Excel
            </Button>
            <Button
              variant="outline" size="sm" className="gap-2"
              disabled={scoped.length === 0}
              onClick={() => exportBellCurvePdf(scoped, config, cycleName, `${filterNote} · ${modeNote}`, banding).catch((e) => toast.error((e as Error).message))}
              title="Download the bell curve as PDF"
            >
              <FileText className="h-4 w-4" /> PDF
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Band mode</Label>
            <Tabs value={bandMode} onValueChange={(v) => setBandMode(v as BandMode)}>
              <TabsList className="flex-wrap h-auto">
                <TabsTrigger value="rating">Rating bands (1–5)</TabsTrigger>
                <TabsTrigger value="slab">Slab %</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <Tabs value={view} onValueChange={(v) => setView(v as GroupKey)}>
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="department">Department</TabsTrigger>
              <TabsTrigger value="business_unit">Business Unit</TabsTrigger>
              <TabsTrigger value="division">Division</TabsTrigger>
              <TabsTrigger value="manager">Manager</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            {FILTER_FIELDS.map(([label, axis]) => (
              <div key={axis} className="space-y-1">
                <Label className="text-xs">{label}</Label>
                <MultiSelectId
                  options={(options[axis] as FilterOption[]).map(([id, name]) => ({ id, label: name }))}
                  value={filters[axis] ?? []}
                  onChange={(v) => setAxis(axis, v)}
                  placeholder="All"
                  ariaLabel={label}
                  searchPlaceholder={`Search ${label.toLowerCase()}…`}
                  className="h-10 w-full"
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <KpiCard label="Total Employees" value={summary.totalEmployees} hint={`${summary.unratedEmployees} unrated`} />
        <KpiCard label="Average Rating" value={summary.averageRating !== null ? summary.averageRating.toFixed(2) : '—'} hint="out of 5" />
        <KpiCard label={hasTargets ? 'Highest Rating Count' : 'Top Slab Count'} value={summary.highestBandCount} hint={summary.highestBandLabel} />
        <KpiCard label={hasTargets ? 'Lowest Rating Count' : 'Lowest Slab Count'} value={summary.lowestBandCount} hint={summary.lowestBandLabel} />
        {hasTargets ? (
          <KpiCard label="Bell Curve Compliance" value={`${summary.compliancePct}%`} hint={`${summary.greenBands} green · ${summary.amberBands} amber · ${summary.redBands} red`} />
        ) : (
          <KpiCard label="Bands In Use" value={`${summary.bandsInUse}/${banding.defs.length}`} hint="slabs with at least one employee" />
        )}
        <KpiCard
          label="Ineligible"
          value={eligibilityCounts.ineligible}
          hint={`${eligibilityCounts.exempted} exempted · ${eligibilityCounts.eligible} eligible`}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <BellCurveChart bands={bands} config={config} denom={summary.ratedEmployees} hasTargets={hasTargets} />
        <DistributionBarChart bands={bands} hasTargets={hasTargets} />
      </div>

      <VarianceTable bands={bands} hasTargets={hasTargets} bandTitle={hasTargets ? 'Rating' : 'Slab'} />

      {hasTargets && (
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
      )}

      <RatingHeatmap
        rows={heat}
        title={viewLabel}
        defs={banding.defs}
        hasTargets={hasTargets}
        selectedIds={selectedIds}
          drilldownResetKey={`${view}|${bandMode}|${FILTER_AXES_ORDER.map((a) => (filters[a] ?? []).join(',')).join('|')}`}
        renderDrilldown={(rowId, bandKey, close) => {
          const def = banding.defs.find((d) => d.key === bandKey);
          const group = heat.find((h) => h.id === rowId);
          if (!def || !group) return null;
          return (
            <BandEmployeeList
              employees={employeesInBand(filtered, view, rowId, banding, bandKey)}
              originalBandLabelOf={(e) => {
                const originalKey = banding.keyOf(e.rating);
                if (originalKey === null || originalKey === bandKey) return null;
                const original = banding.defs.find((d) => d.key === originalKey);
                return original ? `${original.label} ${original.sub}` : null;
              }}
              groupName={group.name}
              bandLabel={def.label}
              bandSub={def.sub}
              slabs={slabs.length > 0 ? slabs : undefined}
              canCalibrate={effectiveRole === 'admin'}
              eligibilityOf={(e) => eligibilityByInstance.get(e.instance_id) ?? null}
              canManageExemptions={canManageExemptions}
              canApproveExemptions={canApproveExemptions}
              capOptions={capOptions}
              onClose={close}
            />
          );
        }}
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
                {hasTargets && <th className="p-3 text-right font-medium">Compliance %</th>}
                {hasTargets && <th className="p-3 text-left font-medium">Status</th>}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.id} className="border-b last:border-0">
                  <td className="p-3 font-medium">{g.name}</td>
                  <td className="p-3 text-right tabular-nums">{g.summary.ratedEmployees}</td>
                  <td className="p-3 text-right tabular-nums">{g.summary.averageRating?.toFixed(2) ?? '—'}</td>
                  {hasTargets && <td className="p-3 text-right tabular-nums">{g.summary.compliancePct}%</td>}
                  {hasTargets && <td className="p-3"><ComplianceChip level={g.worstCompliance ?? 'green'} /></td>}
                </tr>
              ))}
              {groups.length === 0 && (
                <tr><td colSpan={hasTargets ? 5 : 3} className="p-6 text-center text-muted-foreground">No data for the current filters.</td></tr>
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

      <ExemptionPenaltyDialog
        open={penaltyOpen}
        onOpenChange={setPenaltyOpen}
        config={config}
        cycleId={cycleId}
        cycleName={cycleName}
      />

      {canManageExemptions && (
        <BulkExemptionDialog
          open={bulkOpen}
          onOpenChange={setBulkOpen}
          cycleId={cycleId}
          cycleName={cycleName}
          eligMaps={eligMaps}
          policy={exemptionPolicy}
          eligibilityByInstance={eligibilityByInstance}
          rows={(rows as ComprehensiveRow[]).map((r) => ({
            instance_id: r.instance_id,
            employee_code: r.employee_code ?? null,
            employee_name: r.employee_name ?? null,
          }))}
        />
      )}
    </div>
  );
}