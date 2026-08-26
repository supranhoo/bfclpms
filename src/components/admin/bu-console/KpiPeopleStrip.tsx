/**
 * ADR-297 — one row per KPI: the people cells live *inside* the KPI row.
 *
 * This replaces the old per-KRA worksheet (ADR-289 `KraWorksheet`), which
 * printed a second copy of the KPI list underneath the definition list. The
 * grid body is unchanged — same `bu_console_run_snapshot` read, same
 * `reviewRunModel` selection helpers, same audited `bu_console_kpi_advance`
 * batch (POLICY §CONSOLE-WRITE-TIERS) — it is simply scoped to the one KPI the
 * user opened, so a KPI is never listed twice on the same screen.
 *
 * The snapshot is fetched per KRA and shared through the react-query cache, so
 * opening a second KPI under the same KRA costs no extra round-trip.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { BuConsoleScope } from '@/hooks/useBuConsole';
import {
  RUN_SKIP_LABELS, useRunAdvanceCommit, useRunAdvancePreview, useRunSnapshot,
  type RunAdvanceResult,
} from '@/hooks/useBuConsoleRun';
import { useBuConsoleCapability } from '@/hooks/useBuConsoleCapability';
import {
  buildCellMap, cellId, isCellPending, isCellSelectable, selectableIdsForKpi,
} from './reviewRunModel';
import { EmployeeScorecardDrawer } from './EmployeeScorecardDrawer';
import { TargetRulesDialog, type TargetRulesTarget } from './TargetRulesDialog';
import { stageLabel } from './pipelineStages';
import { ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react';

const COL_W = 128;
const PAGE_SIZE = 100;

export interface KpiPeopleStripProps {
  scope: BuConsoleScope;
  categoryId: string | null;
  kraName: string;
  /** Canonical KPI key from the console tree — used to pick this KPI's row. */
  kpiKey: string;
  kpiName: string;
  /** Stage the run is working at — owned by the console header stage rail. */
  stage: string;
}

export function KpiPeopleStrip({
  scope, categoryId, kraName, kpiKey, kpiName, stage,
}: KpiPeopleStripProps) {
  const { canWrite } = useBuConsoleCapability();
  const [page, setPage] = useState(1);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [remarks, setRemarks] = useState('');
  const [result, setResult] = useState<RunAdvanceResult | null>(null);
  const [drawerEmployee, setDrawerEmployee] = useState<{ id: string; name: string | null } | null>(null);
  const [ruleTarget, setRuleTarget] = useState<TargetRulesTarget | null>(null);

  useEffect(() => { setSelection(new Set()); setResult(null); setPage(1); }, [scope, stage, kraName, kpiKey]);

  const args = useMemo(
    () => ({ ...scope, stage, categoryId, kraName, page, pageSize: PAGE_SIZE }),
    [scope, stage, categoryId, kraName, page],
  );
  const { data, isFetching } = useRunSnapshot(args);
  const preview = useRunAdvancePreview();
  const commit = useRunAdvanceCommit();

  const employees = data?.employees ?? [];
  const kpi = useMemo(
    () => (data?.kpis ?? []).find(k => k.kpi_key === kpiKey) ?? null,
    [data, kpiKey],
  );
  const map = useMemo(() => buildCellMap(data?.cells ?? []), [data]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const colVirt = useVirtualizer({
    count: employees.length,
    horizontal: true,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => COL_W,
    overscan: 6,
  });

  const selectableIds = useMemo(
    () => (kpi ? selectableIdsForKpi(kpi.kpi_key, employees, map) : []),
    [kpi, employees, map],
  );

  const toggleCell = (kpiId: string) =>
    setSelection(prev => {
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
      { onSuccess: r => { setResult(r); setSelection(new Set()); setRemarks(''); } },
    );

  if (isFetching && !data) {
    return (
      <div className="space-y-1 p-2">
        {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
      </div>
    );
  }

  if (data && !data.authorized) {
    return (
      <Alert variant="destructive" className="m-2">
        <AlertTitle className="text-sm">No access to this scope</AlertTitle>
        <AlertDescription className="text-xs">
          Your role cannot read the Performance Console for the selected organisation.
        </AlertDescription>
      </Alert>
    );
  }

  if (data?.capped) {
    return (
      <Alert className="m-2">
        <AlertTitle className="text-sm">Too many cells to open at once</AlertTitle>
        <AlertDescription className="text-xs">
          {data.employee_total} people x {data.kpi_total} KPIs exceeds the safe grid size. Narrow the
          scope by department or manager and open this KPI again.
        </AlertDescription>
      </Alert>
    );
  }

  if (!kpi) {
    return (
      <p className="px-3 py-4 text-center text-xs text-muted-foreground">
        Nothing waiting at {stageLabel(stage)} for this KPI.
      </p>
    );
  }

  return (
    <div className="space-y-2 p-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {stageLabel(stage)} · {employees.length} of {data?.employee_total ?? 0} people
        </p>
        <div className="ml-auto flex items-center gap-1">
          {canWrite && selectableIds.length > 0 && (
            <Button
              variant="ghost" size="sm" className="h-8 text-xs"
              onClick={() => setSelection(new Set(selectableIds))}
            >
              Select all actionable
            </Button>
          )}
          <Button
            variant="ghost" size="icon" className="h-8 w-8"
            aria-label={`Tiered target rules for ${kpiName}`}
            onClick={() => setRuleTarget({
              categoryId: kpi.category_id, kraName: kpi.kra_name, kpiName: kpi.kpi_name,
            })}
          >
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
          </Button>
          <Button
            variant="ghost" size="icon" className="h-8 w-8"
            aria-label={`Scoring ladder for ${kpiName}`}
            onClick={() => setLadderTarget({
              categoryId: kpi.category_id, kraName: kpi.kra_name, kpiName: kpi.kpi_name,
            })}
          >
            <ListTree className="h-4 w-4 text-muted-foreground" />
          </Button>

          {totalPages > 1 && (
            <>
              <Button
                variant="ghost" size="icon" className="h-8 w-8"
                disabled={page <= 1} onClick={() => setPage(p => p - 1)} aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs tabular-nums text-muted-foreground">{page} / {totalPages}</span>
              <Button
                variant="ghost" size="icon" className="h-8 w-8"
                disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {employees.length === 0 ? (
        <p className="px-3 py-4 text-center text-xs text-muted-foreground">
          Nobody is waiting at {stageLabel(stage)} for this KPI.
        </p>
      ) : (
        <div ref={scrollRef} className="overflow-x-auto rounded-md border bg-background">
          <div style={{ width: colVirt.getTotalSize(), position: 'relative' }}>
            <div className="h-[44px] border-b bg-muted/40">
              {colVirt.getVirtualItems().map(v => {
                const e = employees[v.index];
                return (
                  <button
                    key={e.employee_id}
                    type="button"
                    className="absolute top-0 flex h-[44px] flex-col justify-center border-r px-2 text-left hover:bg-muted"
                    style={{ left: v.start, width: v.size }}
                    onClick={() => setDrawerEmployee({ id: e.employee_id, name: e.employee_name })}
                    title="Open scorecard"
                  >
                    <span className="truncate text-[11px] font-medium">{e.employee_name}</span>
                    <span className="truncate text-[10px] text-muted-foreground">{e.employee_code}</span>
                  </button>
                );
              })}
            </div>
            <div className="relative h-[46px]">
              {colVirt.getVirtualItems().map(v => {
                const e = employees[v.index];
                const cell = map.get(cellId(kpi.kpi_key, e.employee_id));
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
                    aria-label={`${kpi.kpi_name} · ${e.employee_name}`}
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
                        <span className="text-[10px] tabular-nums text-muted-foreground">
                          {cell.achieved_value ?? '—'} / {cell.target_value ?? '—'}
                        </span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {canWrite && selected > 0 && (
        <div className="sticky bottom-2 z-10 space-y-2 rounded-md border bg-card/95 p-3 shadow-lg backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium">
              {selected} cell{selected === 1 ? '' : 's'} selected · move to {stageLabel(stage)}
            </p>
            <p className="w-full text-[11px] text-muted-foreground">
              Rows still waiting at an earlier stage can be signed from here — the stages in between
              are closed with the same score and recorded on the audit trail (ADR-290).
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
            onChange={e => setRemarks(e.target.value)}
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
              {((result.dry_run ? result.will_supersede : result.superseded) ?? 0) > 0 && (
                <> · {(result.dry_run ? result.will_supersede : result.superseded)} close earlier stages</>
              )}
              {result.skip_summary?.length ? (
                <ul className="mt-1 space-y-0.5">
                  {result.skip_summary.map(s => (
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
        onOpenChange={o => !o && setDrawerEmployee(null)}
      />
      <TargetRulesDialog
        target={ruleTarget}
        scope={scope}
        open={!!ruleTarget}
        onOpenChange={o => !o && setRuleTarget(null)}
      />
    </div>
  );
}
