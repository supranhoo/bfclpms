/**
 * BulkSignoffPreview — Dashboard-style impact panel for the Bulk Sign-off
 * dialog (POLICY §111.7.a, v2.66.13.9).
 *
 * Strictly presentational. Consumes a pre-built ImpactSummary from
 * `bulkSignoffImpact.ts`. Loading / error variants delegated to the parent.
 */

import { useState } from 'react';
import {
  ChevronDown, ChevronRight, Calculator, AlertTriangle, ArrowUp, ArrowDown,
  ShieldAlert,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { ImpactSummary, CellPreview, EmployeeRollup } from '@/lib/bulkSignoffImpact';
import type { CarriedSource, KpiRule, CellInputs } from '@/lib/carriedScoreResolver';
import type { QualitativeOption } from '@/lib/qualitativeUom';

interface Props {
  preview: ImpactSummary | null;
  isLoading: boolean;
  error?: string | null;
  /** kpi_id → rule (for UoM + qualitative options on the input). */
  ruleByKpiId?: Map<string, KpiRule>;
  /** kpi_id lookup helper — preview cells store kpi_name; we need kpi_id. */
  kpiIdBySubmissionId?: Map<string, string>;
  /** Current input map (controlled). */
  inputs?: Map<string, CellInputs>;
  /** Per-cell change handler. */
  onCellInputChange?: (submissionId: string, next: CellInputs) => void;
  /** Admin override toggle state — unlocks editing on every row. */
  isOverride?: boolean;
  /** Stage being stamped — highlighted in the all-levels matrix. */
  stageLabel?: string;
  /** Dialog mode — drives column highlight + helper copy + input visibility. */
  mode?: 'signoff' | 'approve';
}

const SOURCE_LABEL: Record<CarriedSource, string> = {
  self: 'self',
  manager: 'manager',
  skip_level: 'skip-lvl',
  hr_pms: 'hr_pms',
  auditor: 'auditor',
  computed: 'computed',
  manual: 'manual',
  override: 'override',
  none: 'no data',
};

function sourceTone(s: CarriedSource): 'default' | 'secondary' | 'outline' | 'destructive' {
  if (s === 'none') return 'destructive';
  if (s === 'computed') return 'outline';
  if (s === 'manual') return 'default';
  if (s === 'override') return 'default';
  return 'secondary';
}

function SourceBadge({ source }: { source: CarriedSource }) {
  return (
    <Badge variant={sourceTone(source)} className={cn(
      'text-[10px] font-medium gap-1 h-5 px-1.5',
      source === 'override' && 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
    )}>
      {source === 'computed' && <Calculator className="h-3 w-3" aria-hidden />}
      {source === 'override' && <ShieldAlert className="h-3 w-3" aria-hidden />}
      {SOURCE_LABEL[source]}
    </Badge>
  );
}

function fmt(n: number | null, signed = false) {
  if (n == null) return '—';
  const v = Math.round(n * 100) / 100;
  return signed && v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2);
}

export function BulkSignoffPreview({
  preview, isLoading, error,
  ruleByKpiId, kpiIdBySubmissionId,
  inputs, onCellInputChange, isOverride = false,
  stageLabel,
  mode = 'signoff',
}: Props) {
  const [expanded, setExpanded] = useState(true);

  if (isLoading) {
    return (
      <div className="space-y-2" data-testid="signoff-preview-loading">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="default" className="py-2">
        <AlertDescription className="text-xs">
          Preview unavailable — sign-off will still work. ({error})
        </AlertDescription>
      </Alert>
    );
  }

  if (!preview || preview.cells.length === 0) return null;

  const { totals, cells, perEmployee } = preview;

  // Hoist KRA · KPI banner when every selected cell shares the same KPI
  // (common case: one bulk action targets one KPI across many employees).
  const firstKra = cells[0]?.kra_name ?? null;
  const firstKpi = cells[0]?.kpi_name ?? null;
  const sharedKra =
    cells.length > 1 && firstKra && cells.every(c => c.kra_name === firstKra)
      ? firstKra
      : null;
  const sharedKpi =
    cells.length > 1 && firstKpi && cells.every(c => c.kpi_name === firstKpi)
      ? firstKpi
      : null;
  const hoistKpi = !!(sharedKra && sharedKpi);

  return (
    <div className="space-y-3" data-testid="signoff-preview">
      {/* ── Strip ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="secondary" className="h-7 px-2 tabular-nums">
          {totals.cellCount} cells
        </Badge>
        <Badge variant="secondary" className="h-7 px-2 tabular-nums">
          {totals.employeeCount} {totals.employeeCount === 1 ? 'employee' : 'employees'}
        </Badge>
        {totals.computedCount > 0 && (
          <Badge variant="outline" className="h-7 px-2 tabular-nums gap-1">
            <Calculator className="h-3 w-3" aria-hidden />
            {totals.computedCount} computed
          </Badge>
        )}
        {totals.overrideCount > 0 && (
          <Badge variant="default" className="h-7 px-2 tabular-nums gap-1 bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30">
            <ShieldAlert className="h-3 w-3" aria-hidden />
            {totals.overrideCount} override
          </Badge>
        )}
        <Badge
          variant={totals.skippedCount > 0 ? 'destructive' : 'secondary'}
          className="h-7 px-2 tabular-nums gap-1"
        >
          {totals.skippedCount > 0 && <AlertTriangle className="h-3 w-3" aria-hidden />}
          {totals.skippedCount} skipped
        </Badge>
        {totals.requiredUnfilled > 0 && (
          <Badge variant="destructive" className="h-7 px-2 tabular-nums gap-1">
            <AlertTriangle className="h-3 w-3" aria-hidden />
            {totals.requiredUnfilled} need score
          </Badge>
        )}
      </div>

      {/* ── Shared KRA · KPI banner (only when every row matches) ──── */}
      {hoistKpi && (
        <div
          className="rounded-md border border-border bg-muted/30 px-3 py-2"
          data-testid="signoff-preview-shared-kpi"
        >
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {sharedKra}
          </div>
          <div className="text-sm font-medium leading-snug">{sharedKpi}</div>
        </div>
      )}

      {/* ── Per-cell collapsible table ───────────────────────────────── */}
      <div className="rounded-md border border-border">
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium hover:bg-muted/50 transition-colors"
          aria-expanded={expanded}
        >
          {expanded
            ? <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            : <ChevronRight className="h-3.5 w-3.5" aria-hidden />}
          Per-cell preview ({cells.length})
        </button>
        {expanded && (
          <CellTable
            cells={cells}
            ruleByKpiId={ruleByKpiId}
            kpiIdBySubmissionId={kpiIdBySubmissionId}
            inputs={inputs}
            onCellInputChange={
              mode === 'approve' && !isOverride ? undefined : onCellInputChange
            }
            isOverride={isOverride}
            targetStageLabel={mode === 'approve' ? 'Final' : stageLabel}
            hideKraKpiCol={hoistKpi}
            allowNa={mode !== 'approve'}
          />
        )}
      </div>

      {/* ── Legend ──────────────────────────────────────────────────── */}
      {mode === 'approve' ? (
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          <strong>Stage columns</strong> show every reviewer score on file. The
          <strong> Final</strong> column is highlighted — that is the immutable
          score Management will stamp, derived from the highest-priority
          completed stage (<em>Auditor &gt; HR PMS &gt; Skip-Level &gt; Manager &gt;
          Self</em>) per POLICY §88. <strong>Resolved</strong> reflects that same
          cascade for each row.
          {isOverride && (
            <> <strong className="text-amber-700 dark:text-amber-300">Override ON</strong> —
            Final is stamped from your Achieved input per row, bypassing the
            §88 cascade. Re-stamps already-APPROVED rows.</>
          )}
        </p>
      ) : (
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          <strong>Stage columns</strong> show every reviewer score on file. The
          <strong> {stageLabel ?? 'target stage'}</strong> column is highlighted
          — that is the column this bulk action will stamp. <strong>Resolved</strong> is
          the value that will be written (carried from the highest prior stage
          or computed from <strong>Achieved</strong>). Type an Achieved value to
          auto-compute the rating on rows marked ●.
        </p>
      )}

      {/* ── Per-employee rollup ──────────────────────────────────────── */}
      {perEmployee.length > 0 && (
        <div className="rounded-md border border-border">
          <div className="px-3 py-2 text-xs font-medium border-b border-border bg-muted/30">
            Per-employee impact (Dashboard parity)
          </div>
          <EmployeeRollupTable rollups={perEmployee} />
        </div>
      )}
    </div>
  );
}

interface CellTableProps {
  cells: CellPreview[];
  ruleByKpiId?: Map<string, KpiRule>;
  kpiIdBySubmissionId?: Map<string, string>;
  inputs?: Map<string, CellInputs>;
  onCellInputChange?: (submissionId: string, next: CellInputs) => void;
  isOverride?: boolean;
  targetStageLabel?: string;
  /** Suppress the KRA · KPI column (banner displayed above instead). */
  hideKraKpiCol?: boolean;
  /** Show the "N/A" toggle per row (sign-off mode only). */
  allowNa?: boolean;
}

type StageKey = 'self' | 'manager' | 'skip_level' | 'hr_pms' | 'auditor' | 'management' | 'final';

const STAGE_COLS: Array<{ key: StageKey; label: string; match: string[] }> = [
  { key: 'self',        label: 'Self',     match: ['self'] },
  { key: 'manager',     label: 'Manager',  match: ['manager'] },
  { key: 'skip_level',  label: 'Skip-Lvl', match: ['skip', 'skip_level', 'skip-level', 'skip-lvl'] },
  { key: 'hr_pms',      label: 'HR PMS',   match: ['hr_pms', 'hr pms', 'hrpms'] },
  { key: 'auditor',     label: 'Auditor',  match: ['auditor'] },
  { key: 'management',  label: 'Mgmt',     match: ['management', 'mgmt'] },
  { key: 'final',       label: 'Final',    match: ['final'] },
];

function stageKeyFromLabel(label?: string): StageKey | null {
  if (!label) return null;
  const norm = label.trim().toLowerCase();
  return STAGE_COLS.find(s => s.match.includes(norm))?.key ?? null;
}

function scoreTone(v: number | null | undefined): string {
  if (v == null) return 'text-muted-foreground/60';
  if (v >= 4) return 'text-emerald-600 dark:text-emerald-400';
  if (v >= 3) return 'text-foreground';
  return 'text-destructive';
}

function StageCell({
  value, highlighted,
}: { value: number | null | undefined; highlighted: boolean }) {
  return (
    <td
      className={cn(
        'p-2 text-right tabular-nums',
        scoreTone(value),
        highlighted && 'bg-primary/5 border-l border-r border-primary/40',
      )}
    >
      {value == null ? '—' : value.toFixed(1)}
    </td>
  );
}

function CellTable({
  cells, ruleByKpiId, kpiIdBySubmissionId, inputs, onCellInputChange, isOverride = false,
  targetStageLabel,
  hideKraKpiCol = false,
  allowNa = false,
}: CellTableProps) {
  const editable = !!onCellInputChange;

  const ruleFor = (c: CellPreview): KpiRule | undefined => {
    const id = kpiIdBySubmissionId?.get(c.submission_id);
    if (!id) return undefined;
    return ruleByKpiId?.get(id);
  };

  const isRowEditable = (c: CellPreview): boolean => {
    if (!editable) return false;
    // Rows with no resolvable score always need input; admin override unlocks all.
    return c.source === 'none' || isOverride;
  };

  const isRowNa = (c: CellPreview): boolean =>
    inputs?.get(c.submission_id)?.isNa === true;

  const toggleNa = (sid: string, checked: boolean) => {
    const prev = inputs?.get(sid) ?? {};
    const next: CellInputs = {
      ...prev,
      isNa: checked || undefined,
      // Marking N/A clears any pending Achieved override; un-marking leaves it.
      achievedOverride: checked ? null : prev.achievedOverride,
    };
    onCellInputChange?.(sid, next);
  };

  const onAch = (sid: string, raw: string) => {
    const trimmed = raw.trim();
    const next: CellInputs = {
      ...(inputs?.get(sid) ?? {}),
      achievedOverride: trimmed === '' ? null : (Number.isFinite(Number(trimmed)) ? Number(trimmed) : trimmed),
    };
    onCellInputChange?.(sid, next);
  };
  const renderAchievedInput = (c: CellPreview) => {
    const rule = ruleFor(c);
    const v = inputs?.get(c.submission_id)?.achievedOverride ?? '';
    const qual = Array.isArray(rule?.qualitative_options)
      ? (rule!.qualitative_options as QualitativeOption[])
      : null;
    if (rule && (rule.uom_type === 'binary' || rule.uom_type === 'tiered') && qual && qual.length > 0) {
      return (
        <Select
          value={v === '' || v == null ? '' : String(v)}
          onValueChange={(val) => onAch(c.submission_id, val)}
        >
          <SelectTrigger className="h-7 w-[110px] text-xs" aria-label="Achieved option">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {qual.map((q) => (
              <SelectItem key={String(q.rating) + q.label} value={String(q.rating)} className="text-xs">
                {q.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    return (
      <div className="inline-flex items-center gap-1">
        <Input
          type="number"
          inputMode="decimal"
          value={v === '' || v == null ? '' : String(v)}
          onChange={(e) => onAch(c.submission_id, e.target.value)}
          className="h-7 w-[80px] text-xs px-1.5 text-right"
          aria-label="Achieved value"
          placeholder="—"
        />
        {rule?.uom && (
          <span className="text-[10px] text-muted-foreground">{rule.uom}</span>
        )}
      </div>
    );
  };

  const targetKey = stageKeyFromLabel(targetStageLabel);

  return (
    <div className="max-h-[60vh] overflow-auto">
      {/* Desktop ≥ md — wide multi-stage matrix */}
      <div className="hidden md:block overflow-x-auto">
        <table
          className="w-full text-xs min-w-[1280px]"
          role="table"
          aria-label="Per-cell scoring across all review levels"
        >
          <thead className="sticky top-0 bg-background z-10">
            <tr className="border-b border-border">
              <th className="text-left p-2 font-medium text-muted-foreground">Employee</th>
              {!hideKraKpiCol && (
                <th className="text-left p-2 font-medium text-muted-foreground">KRA · KPI</th>
              )}
              <th className="text-left p-2 font-medium text-muted-foreground">UoM</th>
              <th className="text-right p-2 font-medium text-muted-foreground">Target</th>
              <th className="text-right p-2 font-medium text-muted-foreground">Wt%</th>
              <th className="text-right p-2 font-medium text-muted-foreground">Achvd</th>
              {editable && <th className="text-right p-2 font-medium text-muted-foreground">Override</th>}
              {editable && allowNa && (
                <th className="text-center p-2 font-medium text-muted-foreground">N/A</th>
              )}
              {STAGE_COLS.map(s => (
                <th
                  key={s.key}
                  className={cn(
                    'text-right p-2 font-medium text-muted-foreground',
                    targetKey === s.key && 'bg-primary/10 text-primary border-l border-r border-primary/40',
                  )}
                >
                  {s.label}
                </th>
              ))}
              <th className="text-right p-2 font-medium text-muted-foreground">Resolved</th>
              <th className="text-left p-2 font-medium text-muted-foreground">Source</th>
              <th className="text-right p-2 font-medium text-muted-foreground">Impact</th>
            </tr>
          </thead>
          <tbody>
            {cells.map(c => {
              const stages = c.stageScores;
              const naMarked = isRowNa(c);
              return (
                <tr
                  key={c.submission_id}
                  className={cn(
                    'border-b border-border/50 hover:bg-muted/50',
                    c.source === 'none' && 'bg-destructive/5',
                    c.source === 'override' && 'bg-amber-500/5',
                    naMarked && 'bg-muted/40',
                  )}
                >
                  <td className="p-2 truncate max-w-[140px]">{c.employee_name}</td>
                  {!hideKraKpiCol && (
                    <td className="p-2 max-w-[220px]">
                      {c.kra_name && (
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">
                          {c.kra_name}
                        </div>
                      )}
                      <div className="truncate">{c.kpi_name}</div>
                    </td>
                  )}
                  <td className="p-2 text-muted-foreground truncate max-w-[80px]">{c.uom ?? '—'}</td>
                  <td className="p-2 text-right tabular-nums text-muted-foreground">
                    {c.target_value == null ? '—' : c.target_value}
                  </td>
                  <td className="p-2 text-right tabular-nums">{c.weightage}%</td>
                  <td className="p-2 text-right tabular-nums text-muted-foreground">
                    {c.achieved_current == null || c.achieved_current === '' ? '—' : String(c.achieved_current)}
                  </td>
                  {editable && (
                    <td className="p-2 text-right">
                      {naMarked
                        ? <span className="text-muted-foreground italic">N/A</span>
                        : isRowEditable(c)
                          ? renderAchievedInput(c)
                          : <span className="text-muted-foreground">—</span>}
                    </td>
                  )}
                  {editable && allowNa && (
                    <td className="p-2 text-center">
                      <Checkbox
                        checked={naMarked}
                        onCheckedChange={(v) => toggleNa(c.submission_id, v === true)}
                        aria-label={`Mark ${c.employee_name} ${c.kpi_name} as N/A`}
                      />
                    </td>
                  )}
                  {STAGE_COLS.map(s => (
                    <StageCell
                      key={s.key}
                      value={stages?.[s.key] ?? null}
                      highlighted={targetKey === s.key}
                    />
                  ))}
                  <td className="p-2 text-right tabular-nums font-semibold">
                    {c.score == null
                      ? <span className="inline-flex items-center gap-1 text-destructive">● —</span>
                      : c.score.toFixed(1)}
                  </td>
                  <td className="p-2"><SourceBadge source={c.source} /></td>
                  <td className={cn(
                    'p-2 text-right tabular-nums',
                    c.weightedImpact != null && c.weightedImpact > 0 && 'text-emerald-600 dark:text-emerald-400',
                  )}>
                    {c.weightedImpact == null ? '—' : fmt(c.weightedImpact, true)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile < md: stacked cards with 3×2 stage mini-grid */}
      <div className="md:hidden divide-y divide-border">
        {cells.map(c => {
          const stages = c.stageScores;
          return (
            <Card key={c.submission_id} className={cn(
              'rounded-none border-0 shadow-none',
              c.source === 'none' && 'bg-destructive/5',
              c.source === 'override' && 'bg-amber-500/5',
            )}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm truncate">{c.employee_name}</span>
                  <SourceBadge source={c.source} />
                </div>
                {c.kra_name && (
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">{c.kra_name}</p>
                )}
                <p className="text-xs text-muted-foreground truncate">{c.kpi_name}</p>
                {stages && (
                  <div className="grid grid-cols-3 gap-1 pt-1">
                    {STAGE_COLS.map(s => (
                      <div
                        key={s.key}
                        className={cn(
                          'flex items-center justify-between rounded border border-border/60 px-1.5 py-1 text-[10px]',
                          targetKey === s.key && 'border-primary/60 bg-primary/5',
                        )}
                      >
                        <span className="text-muted-foreground">{s.label}</span>
                        <span className={cn('tabular-nums font-medium', scoreTone(stages[s.key]))}>
                          {stages[s.key] == null ? '—' : stages[s.key]!.toFixed(1)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {editable && isRowEditable(c) && (
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-[10px] text-muted-foreground w-14">Achieved</span>
                    {renderAchievedInput(c)}
                  </div>
                )}
                <div className="flex items-center justify-between text-xs pt-1">
                  <span>Wt {c.weightage}%</span>
                  <span className="tabular-nums">
                    Resolved {c.score == null ? <span className="text-destructive">● —</span> : c.score.toFixed(1)}
                  </span>
                  <span className={cn(
                    'tabular-nums',
                    c.weightedImpact != null && c.weightedImpact > 0 && 'text-emerald-600 dark:text-emerald-400',
                  )}>
                    Impact {c.weightedImpact == null ? '—' : fmt(c.weightedImpact, true)}
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function EmployeeRollupTable({ rollups }: { rollups: EmployeeRollup[] }) {
  return (
    <div className="max-h-48 overflow-auto">
      <table className="w-full text-xs hidden md:table">
        <thead className="sticky top-0 bg-background z-10">
          <tr className="border-b border-border">
            <th className="text-left p-2 font-medium text-muted-foreground">Employee</th>
            <th className="text-right p-2 font-medium text-muted-foreground">Cells</th>
            <th className="text-right p-2 font-medium text-muted-foreground">Σ Wt%</th>
            <th className="text-right p-2 font-medium text-muted-foreground">Self avg</th>
            <th className="text-right p-2 font-medium text-muted-foreground">Mgr avg</th>
            <th className="text-right p-2 font-medium text-muted-foreground">Current</th>
            <th className="text-right p-2 font-medium text-muted-foreground">Projected</th>
          </tr>
        </thead>
        <tbody>
          {rollups.map(e => (
            <tr key={e.employee_id} className="border-b border-border/50 hover:bg-muted/50">
              <td className="p-2 truncate max-w-[160px]">{e.employee_name}</td>
              <td className="p-2 text-right tabular-nums">{e.cellsInBatch}</td>
              <td className="p-2 text-right tabular-nums">{e.batchWeightSum}%</td>
              <td className={cn('p-2 text-right tabular-nums', scoreTone(e.selfAvg ?? null))}>
                {e.selfAvg == null ? '—' : e.selfAvg.toFixed(2)}
              </td>
              <td className={cn('p-2 text-right tabular-nums', scoreTone(e.managerAvg ?? null))}>
                {e.managerAvg == null ? '—' : e.managerAvg.toFixed(2)}
              </td>
              <td className="p-2 text-right tabular-nums">{e.currentOverall.toFixed(2)}</td>
              <td className="p-2 text-right tabular-nums font-medium">
                <span className="inline-flex items-center gap-1 justify-end">
                  {e.projectedOverall.toFixed(2)}
                  {e.delta > 0 && (
                    <span className="text-emerald-600 dark:text-emerald-400 inline-flex items-center">
                      <ArrowUp className="h-3 w-3" aria-hidden /> {fmt(e.delta, true)}
                    </span>
                  )}
                  {e.delta < 0 && (
                    <span className="text-destructive inline-flex items-center">
                      <ArrowDown className="h-3 w-3" aria-hidden /> {fmt(e.delta)}
                    </span>
                  )}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="md:hidden divide-y divide-border">
        {rollups.map(e => (
          <div key={e.employee_id} className="p-3 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-sm truncate">{e.employee_name}</span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {e.cellsInBatch} cells · {e.batchWeightSum}%
              </span>
            </div>
            <div className="flex items-center justify-between text-xs tabular-nums">
              <span>Current {e.currentOverall.toFixed(2)}</span>
              <span className={cn(
                'font-medium',
                e.delta > 0 && 'text-emerald-600 dark:text-emerald-400',
                e.delta < 0 && 'text-destructive',
              )}>
                → {e.projectedOverall.toFixed(2)} ({fmt(e.delta, true)})
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
