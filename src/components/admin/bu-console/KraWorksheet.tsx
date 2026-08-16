/**
 * ADR-289 — the review worksheet, inline under the KRA it belongs to.
 *
 * This is the old Review Run grid (ADR-286) with one change of address: it is
 * no longer a tab of its own. Expanding a KRA while the console is in Review
 * mode renders this block underneath that KRA row, scoped to that KRA — which
 * also means only one KRA's cells ever load at a time.
 *
 * KPIs are rows (one shared org value usually lands on many people) and
 * employees are columns; the column header opens the person-first drawer.
 * Selection is by cell, row or column, and the move forward goes through the
 * audited `bu_console_kpi_advance` batch (POLICY §CONSOLE-WRITE-TIERS).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { BuConsoleScope } from '@/hooks/useBuConsole';
import {
  RUN_SKIP_LABELS, useRunAdvanceCommit, useRunAdvancePreview, useRunSnapshot,
  type RunAdvanceResult,
} from '@/hooks/useBuConsoleRun';
import { useBuConsoleCapability } from '@/hooks/useBuConsoleCapability';
import {
  buildCellMap, cellId, isCellPending, isCellSelectable, runCounters,
  selectableIdsForEmployee, selectableIdsForKpi, toggleAll,
} from './reviewRunModel';
import { EmployeeScorecardDrawer } from './EmployeeScorecardDrawer';
import { TargetRulesDialog, type TargetRulesTarget } from './TargetRulesDialog';
import { stageLabel } from './pipelineStages';
import { ChevronLeft, ChevronRight, RefreshCw, SlidersHorizontal } from 'lucide-react';

const COL_W = 128;
const ROW_H = 46;
const PAGE_SIZE = 100;

interface Props {
  scope: BuConsoleScope;
  categoryId: string | null;
  kraName: string;
  /** Stage the run is working at — owned by the console header. */
  stage: string;
}

export function KraWorksheet({ scope, categoryId, kraName, stage }: Props) {
  const { canWrite } = useBuConsoleCapability();
  const [page, setPage] = useState(1);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [remarks, setRemarks] = useState('');
  const [result, setResult] = useState<RunAdvanceResult | null>(null);
  const [drawerEmployee, setDrawerEmployee] = useState<{ id: string; name: string | null } | null>(null);
  const [ruleTarget, setRuleTarget] = useState<TargetRulesTarget | null>(null);

  // Scope or stage changes invalidate the current selection.
  useEffect(() => { setSelection(new Set()); setResult(null); setPage(1); }, [scope, stage, kraName]);

  const args = useMemo(
    () => ({ ...scope, stage, categoryId, kraName, page, pageSize: PAGE_SIZE }),
    [scope, stage, categoryId, kraName, page],
  );
  const { data, isFetching, refetch } = useRunSnapshot(args);
  const preview = useRunAdvancePreview();
  const commit = useRunAdvanceCommit();

  const employees = data?.employees ?? [];
  const kpis = data?.kpis ?? [];
  const cells = useMemo(() => data?.cells ?? [], [data]);
  const map = useMemo(() => buildCellMap(cells), [cells]);
  const counters = useMemo(() => runCounters(cells), [cells]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const colVirt = useVirtualizer({
    count: employees.length,
    horizontal: true,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => COL_W,
    overscan: 6,
  });

  const toggleCell = (kpiId: string) =>
    setSelection((prev) => {
      const next = new Set(prev);
      next.has(kpiId) ? next.delete(kpiId) : next.add(kpiId);
      return next;
    });

  const totalPages = Math.max(1, Math.ceil((data?.employee_total ?? 0) / PAGE_SIZE));
  const selected = selection.size;

  const runPreview = () =>
    preview.mutate(
      { kpiIds: [...selection], targetStage: stage, remarks: remarks.trim() || null },
      { onSuccess: setResult },
    );
  const runCommit = () =>
    commit.mutate(
      { kpiIds: [...selection], targetStage: stage, remarks: remarks.trim() || null },
      { onSuccess: (r) => { setResult(r); setSelection(new Set()); setRemarks(''); } },
    );

  return (
    <div className="space-y-2">
      {/* Run bar for this KRA */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-background px-2 py-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Review · {stageLabel(stage)}
        </p>
        {data && (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <Badge variant="outline">{data.kpi_total} KPIs</Badge>
            <Badge variant="outline">{data.employee_total} people</Badge>
            <Badge variant="outline" className="border-warning/40 text-warning">{counters.pending} pending</Badge>
            <Badge variant="outline" className="border-success/40 text-success">{counters.done} scored</Badge>
            {counters.locked > 0 && <Badge variant="outline">{counters.locked} approved</Badge>}
          </div>
        )}
        <div className="ml-auto flex items-center gap-1">
          {totalPages > 1 && (
            <>
              <Button variant="ghost" size="icon" className="h-7 w-7"
                disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="text-xs tabular-nums text-muted-foreground">{page} / {totalPages}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7"
                disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" className="h-7" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', isFetching && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {data && !data.authorized && (
        <Alert variant="destructive">
          <AlertTitle>No access to this scope</AlertTitle>
          <AlertDescription className="text-xs">
            Your role cannot read the Performance Console for the selected organisation.
          </AlertDescription>
        </Alert>
      )}

      {data?.capped && (
        <Alert>
          <AlertTitle className="text-sm">Too many cells to open at once</AlertTitle>
          <AlertDescription className="text-xs">
            {data.employee_total} people x {data.kpi_total} KPIs exceeds the safe grid size. Narrow
            the scope by department or manager and open this KRA again.
          </AlertDescription>
        </Alert>
      )}

      {isFetching && !data && (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      )}

      {data && data.authorized && !data.capped && kpis.length > 0 && (
        <div className="overflow-hidden rounded-md border bg-card">
          <div className="flex">
            {/* Sticky KPI column */}
            <div className="w-[260px] shrink-0 border-r sm:w-[300px]">
              <div className="flex h-[52px] items-end border-b bg-muted/40 px-3 pb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                KPI
              </div>
              {kpis.map((k) => {
                const ids = selectableIdsForKpi(k.kpi_key, employees, map);
                return (
                  <div key={k.kpi_key} className="flex items-center gap-2 border-b px-3" style={{ height: ROW_H }}>
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      disabled={!canWrite || ids.length === 0}
                      onClick={() => setSelection((prev) => toggleAll(prev, ids))}
                      title={canWrite ? 'Select every actionable cell in this row' : undefined}
                    >
                      <div className="truncate text-xs font-medium">{k.kpi_name}</div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {k.employee_count} people
                        {k.target_variants > 1 && <> · {k.target_variants} targets</>}
                      </div>
                    </button>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost" size="icon" className="h-6 w-6 shrink-0"
                          aria-label={`Target rules for ${k.kpi_name}`}
                          onClick={() => setRuleTarget({
                            categoryId: k.category_id, kraName: k.kra_name, kpiName: k.kpi_name,
                          })}
                        >
                          <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">Tiered target rules</TooltipContent>
                    </Tooltip>
                  </div>
                );
              })}
            </div>

            {/* Virtualized employee columns */}
            <div ref={scrollRef} className="flex-1 overflow-x-auto">
              <div style={{ width: colVirt.getTotalSize(), position: 'relative' }}>
                <div className="h-[52px] border-b bg-muted/40">
                  {colVirt.getVirtualItems().map((v) => {
                    const e = employees[v.index];
                    const ids = selectableIdsForEmployee(e.employee_id, kpis, map);
                    return (
                      <button
                        key={e.employee_id}
                        type="button"
                        className="absolute top-0 flex h-[52px] flex-col justify-end border-r px-2 pb-2 text-left hover:bg-muted"
                        style={{ left: v.start, width: v.size }}
                        onClick={() => setDrawerEmployee({ id: e.employee_id, name: e.employee_name })}
                        onDoubleClick={() => canWrite && setSelection((prev) => toggleAll(prev, ids))}
                        title="Open scorecard"
                      >
                        <span className="truncate text-[11px] font-medium">{e.employee_name}</span>
                        <span className="truncate text-[10px] text-muted-foreground">{e.employee_code}</span>
                      </button>
                    );
                  })}
                </div>
                {kpis.map((k, rowIdx) => (
                  <div key={k.kpi_key} className="relative border-b" style={{ height: ROW_H }}>
                    {colVirt.getVirtualItems().map((v) => {
                      const e = employees[v.index];
                      const cell = map.get(cellId(k.kpi_key, e.employee_id));
                      const selectable = canWrite && isCellSelectable(cell);
                      const isSelected = !!cell && selection.has(cell.kpi_id);
                      return (
                        <button
                          key={e.employee_id}
                          type="button"
                          disabled={!selectable}
                          onClick={() => cell && toggleCell(cell.kpi_id)}
                          className={cn(
                            'absolute top-0 flex h-full flex-col items-center justify-center border-r text-[11px]',
                            !cell && 'bg-muted/20',
                            cell?.is_na && 'text-muted-foreground',
                            isCellPending(cell) && 'bg-warning/5',
                            isSelected && 'bg-primary/10 ring-1 ring-inset ring-primary',
                            selectable && 'hover:bg-muted',
                          )}
                          style={{ left: v.start, width: v.size }}
                          aria-label={`${k.kpi_name} · ${e.employee_name}`}
                          data-row={rowIdx}
                        >
                          {!cell ? (
                            <span className="text-muted-foreground/50">·</span>
                          ) : cell.is_na ? (
                            <span>N/A</span>
                          ) : (
                            <>
                              <span className="font-medium tabular-nums">
                                {cell.stage_score !== null && cell.stage_score !== undefined
                                  ? Number(cell.stage_score).toFixed(2)
                                  : '—'}
                              </span>
                              <span className="text-[10px] text-muted-foreground tabular-nums">
                                {cell.achieved_value ?? '—'} / {cell.target_value ?? '—'}
                              </span>
                            </>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {data && data.authorized && !data.capped && kpis.length === 0 && !isFetching && (
        <p className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
          Nothing waiting at {stageLabel(stage)} under this KRA.
        </p>
      )}

      {/* Action bar */}
      {canWrite && selected > 0 && (
        <div className="sticky bottom-2 z-10 space-y-2 rounded-md border bg-card/95 p-3 shadow-lg backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium">
              {selected} cell{selected === 1 ? '' : 's'} selected · move to {stageLabel(stage)}
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setSelection(new Set()); setResult(null); }}>
                Clear
              </Button>
              <Button variant="outline" size="sm" onClick={runPreview} disabled={preview.isPending}>
                {preview.isPending ? 'Checking…' : 'Preview'}
              </Button>
              <Button size="sm" onClick={runCommit} disabled={commit.isPending}>
                {commit.isPending ? 'Moving…' : 'Move forward'}
              </Button>
            </div>
          </div>
          <Textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Remarks for this batch (optional) — stored on the audit trail."
            className="h-14 resize-none text-xs"
          />
          {result && (
            <div className="text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground">
                {result.dry_run ? `${result.will_advance ?? 0} would move` : `${result.advanced ?? 0} moved`}
              </span>
              {' · '}
              {(result.dry_run ? result.will_skip : result.skipped) ?? 0} skipped
              {result.skip_summary?.length ? (
                <ul className="mt-1 space-y-0.5">
                  {result.skip_summary.map((s) => (
                    <li key={s.reason}>{RUN_SKIP_LABELS[s.reason] ?? s.reason} — {s.count}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
        </div>
      )}

      <EmployeeScorecardDrawer
        employeeId={drawerEmployee?.id ?? null}
        employeeName={drawerEmployee?.name}
        period={scope.period}
        year={scope.year}
        targetStage={stage}
        open={!!drawerEmployee}
        onOpenChange={(o) => !o && setDrawerEmployee(null)}
      />
      <TargetRulesDialog
        target={ruleTarget}
        scope={scope}
        open={!!ruleTarget}
        onOpenChange={(o) => !o && setRuleTarget(null)}
      />
    </div>
  );
}