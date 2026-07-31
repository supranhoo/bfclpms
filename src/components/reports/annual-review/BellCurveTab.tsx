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
  BAND_MODE_LABELS,
  computeBands,
  employeesInBand,
  groupBands,
  heatmapBands,
  makeBanding,
  matchesEligibility,
  matchesScoringSource,
  normalizationHints,
  summarize,
  SCORING_SOURCE_LABELS,
  SCORING_SOURCE_ORDER,
  scoringSourceOf,
  type BandMode,
  type BandRow,
  type BellCurveInput,
  type GroupKey,
  type ScoringSource,
} from '@/lib/annualReview/bellCurve';
import { useBellCurveConfig } from '@/hooks/useBellCurveConfig';
import { useAnnualReviewRatingSlabs } from '@/hooks/useAnnualReviewRatingSlabs';
import { fetchTemplateEligibilityMaps } from '@/services/annualReview/eligibilityReportColumns';
import {
  ELIGIBILITY_STATUS_LABELS, ELIGIBILITY_STATUS_ORDER, resolveEligibility,
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
  const [bu, setBu] = useState(ALL);
  const [dept, setDept] = useState(ALL);
  const [manager, setManager] = useState(ALL);
  const [division, setDivision] = useState(ALL);
  const [pmsGrade, setPmsGrade] = useState(ALL);
  const [scoringSource, setScoringSource] = useState<string>(ALL);
  const [eligibility, setEligibility] = useState<string>(ALL);
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
      scoringSource: SCORING_SOURCE_ORDER
        .filter((s) => rows.some((r) => scoringSourceOf(r as BellCurveInput) === s))
        .map((s) => [s, SCORING_SOURCE_LABELS[s]] as [string, string]),
    };
  }, [rows]);

  const filtered = useMemo<BellCurveInput[]>(() => {
    // Attach effective eligibility to every row before any filtering.
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
    return base.filter((r) =>
      (bu === ALL || r.business_unit_id === bu)
      && (dept === ALL || r.department_id === dept)
      && (manager === ALL || r.manager_id === manager)
      && (division === ALL || r.division_id === division)
      && (pmsGrade === ALL || r.grade === pmsGrade)
      && matchesEligibility(r, eligibility === ALL ? null : (eligibility as EligibilityStatus))
      && matchesScoringSource(r, scoringSource === ALL ? null : (scoringSource as ScoringSource)));
  }, [rows, eligMaps, exemptions, exemptionPolicy, cycleId, isManagerScope, user?.id,
    bu, dept, manager, division, pmsGrade, scoringSource, eligibility]);

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

  const filterNote = scoringSource === ALL
    ? 'Scoring source: All'
    : `Scoring source: ${SCORING_SOURCE_LABELS[scoringSource as ScoringSource]}`;

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

  const banding = useMemo(
    () => (config ? makeBanding(bandMode, config, slabs) : null),
    [config, bandMode, slabs],
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
  if (isLoading || !config || !summary || !banding) {
    return <Card><CardContent className="p-8 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading distribution…</CardContent></Card>;
  }

  const hasTargets = banding.hasTargets;
  const modeNote = `Bands: ${BAND_MODE_LABELS[bandMode]}`;

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
            <Button
              variant="outline" size="sm" className="gap-2"
              disabled={scoped.length === 0}
              onClick={() => exportBellCurveExcel(scoped, config, cycleName, `${filterNote} · ${modeNote}`, banding).catch((e) => toast.error((e as Error).message))}
            >
              <Download className="h-4 w-4" /> Excel
            </Button>
            <Button
              variant="outline" size="sm" className="gap-2"
              disabled={scoped.length === 0}
              onClick={() => exportBellCurvePdf(scoped, config, cycleName, `${filterNote} · ${modeNote}`, banding).catch((e) => toast.error((e as Error).message))}
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
            {([
              ['Business Unit', bu, setBu, options.bu],
              ['Department', dept, setDept, options.dept],
              ['Manager', manager, setManager, options.manager],
              ['Division / Location', division, setDivision, options.division],
              ['PMS Grade', pmsGrade, setPmsGrade, options.grade],
              ['Scoring Source (KRA)', scoringSource, setScoringSource, options.scoringSource],
              ['Eligibility', eligibility, setEligibility,
                ELIGIBILITY_STATUS_ORDER.map((s) => [s, ELIGIBILITY_STATUS_LABELS[s]] as [string, string])],
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
          drilldownResetKey={`${view}|${bandMode}|${bu}|${dept}|${manager}|${division}|${pmsGrade}|${scoringSource}|${eligibility}`}
        renderDrilldown={(rowId, bandKey, close) => {
          const def = banding.defs.find((d) => d.key === bandKey);
          const group = heat.find((h) => h.id === rowId);
          if (!def || !group) return null;
          return (
            <BandEmployeeList
              employees={employeesInBand(filtered, view, rowId, banding, bandKey)}
              groupName={group.name}
              bandLabel={def.label}
              bandSub={def.sub}
              slabs={slabs.length > 0 ? slabs : undefined}
              canCalibrate={effectiveRole === 'admin'}
              eligibilityOf={(e) => eligibilityByInstance.get(e.instance_id) ?? null}
              canManageExemptions={canManageExemptions}
              canApproveExemptions={canApproveExemptions}
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
    </div>
  );
}