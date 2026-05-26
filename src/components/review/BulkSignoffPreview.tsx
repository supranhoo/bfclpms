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
}

const SOURCE_LABEL: Record<CarriedSource, string> = {
  self: 'self',
  manager: 'manager',
  skip_level: 'skip-lvl',
  hr_pms: 'hr_pms',
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
            onCellInputChange={onCellInputChange}
            isOverride={isOverride}
          />
        )}
      </div>

      {/* ── Legend ──────────────────────────────────────────────────── */}
      <p className="text-[10px] text-muted-foreground leading-relaxed">
        <strong>Badges:</strong> self · manager · skip-lvl · hr_pms · computed (rating from Achieved) · override · no data.
        Type an <strong>Achieved</strong> value to auto-compute the rating.
      </p>

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
}

function CellTable({
  cells, ruleByKpiId, kpiIdBySubmissionId, inputs, onCellInputChange, isOverride = false,
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

  return (
    <div className="max-h-64 overflow-auto">
      {/* Desktop ≥ md */}
      <table className="w-full text-xs hidden md:table" role="table">
        <thead className="sticky top-0 bg-background z-10">
          <tr className="border-b border-border">
            <th className="text-left p-2 font-medium text-muted-foreground">Employee</th>
            <th className="text-left p-2 font-medium text-muted-foreground">KPI</th>
            <th className="text-right p-2 font-medium text-muted-foreground">Wt%</th>
            {editable && <th className="text-right p-2 font-medium text-muted-foreground">Achieved</th>}
            <th className="text-right p-2 font-medium text-muted-foreground">Score</th>
            <th className="text-left p-2 font-medium text-muted-foreground">Source</th>
            <th className="text-right p-2 font-medium text-muted-foreground">Impact</th>
          </tr>
        </thead>
        <tbody>
          {cells.map(c => (
            <tr
              key={c.submission_id}
              className={cn(
                'border-b border-border/50 hover:bg-muted/50',
                c.source === 'none' && 'bg-destructive/5',
                c.source === 'override' && 'bg-amber-500/5',
              )}
            >
              <td className="p-2 truncate max-w-[140px]">{c.employee_name}</td>
              <td className="p-2 truncate max-w-[200px]">{c.kpi_name}</td>
              <td className="p-2 text-right tabular-nums">{c.weightage}%</td>
              {editable && (
                <td className="p-2 text-right">
                  {isRowEditable(c) ? renderAchievedInput(c) : <span className="text-muted-foreground">—</span>}
                </td>
              )}
              <td className="p-2 text-right tabular-nums font-medium">
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
          ))}
        </tbody>
      </table>

      {/* Mobile < md: stacked cards */}
      <div className="md:hidden divide-y divide-border">
        {cells.map(c => (
          <Card key={c.submission_id} className={cn(
            'rounded-none border-0 shadow-none',
            c.source === 'none' && 'bg-destructive/5',
            c.source === 'override' && 'bg-amber-500/5',
          )}>
            <CardContent className="p-3 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm truncate">{c.employee_name}</span>
                <SourceBadge source={c.source} />
              </div>
              <p className="text-xs text-muted-foreground truncate">{c.kpi_name}</p>
              {editable && isRowEditable(c) && (
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-[10px] text-muted-foreground w-14">Achieved</span>
                  {renderAchievedInput(c)}
                </div>
              )}
              <div className="flex items-center justify-between text-xs">
                <span>Wt {c.weightage}%</span>
                <span className="tabular-nums">
                  Score {c.score == null ? <span className="text-destructive">● —</span> : c.score.toFixed(1)}
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
        ))}
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
