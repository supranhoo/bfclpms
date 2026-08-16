/**
 * ADR-286 — close out one person without leaving the console.
 *
 * The Review Run grid is KPI-first; this drawer is the person-first view of
 * the same data. It lists every KRA/KPI the employee carries for the period
 * with the stage scores already recorded, and lets a writer move the whole
 * scorecard forward in one audited batch (server: `bu_console_kpi_advance`).
 */
import { useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScorePill } from './ScorePill';
import { RUN_SKIP_LABELS, useEmployeeScorecard, useRunAdvanceCommit } from '@/hooks/useBuConsoleRun';
import { useBuConsoleCapability } from '@/hooks/useBuConsoleCapability';
import { stageLabel } from './PipelineTab';
import { ArrowRight, Lock } from 'lucide-react';

interface Props {
  employeeId: string | null;
  employeeName?: string | null;
  period: string | null;
  year: number | null;
  /** Stage the run is currently working at — the batch target. */
  targetStage: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SCORE_KEY: Record<string, keyof import('@/hooks/useBuConsoleRun').EmployeeScorecardRow> = {
  self_review: 'self_score',
  manager_check: 'manager_score',
  functional_manager_check: 'functional_manager_score',
  skip_level_check: 'skip_level_score',
  hr_pms_review: 'hr_pms_score',
  audit: 'auditor_score',
  management_review: 'management_score',
};

export function EmployeeScorecardDrawer({
  employeeId, employeeName, period, year, targetStage, open, onOpenChange,
}: Props) {
  const { canWrite, canActOnStatus } = useBuConsoleCapability();
  const { data, isLoading } = useEmployeeScorecard(open ? employeeId : null, period, year);
  const commit = useRunAdvanceCommit();
  const [remarks, setRemarks] = useState('');

  const rows = data?.rows ?? [];
  const movable = useMemo(
    () => rows.filter((r) => r.final_score === null && r.actionable !== false && canActOnStatus(r.status)),
    [rows, canActOnStatus],
  );
  const locked = rows.length - movable.length;
  const scoreKey = SCORE_KEY[targetStage];

  const move = () => {
    if (!movable.length) return;
    commit.mutate(
      { kpiIds: movable.map((r) => r.kpi_id), targetStage, remarks: remarks.trim() || null },
      { onSuccess: () => setRemarks('') },
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle className="text-base">{data?.employee?.employee_name ?? employeeName ?? 'Employee'}</SheetTitle>
          <SheetDescription className="text-xs">
            {[data?.employee?.employee_code, data?.employee?.department_name, `${period} ${year}`]
              .filter(Boolean).join(' · ')}
          </SheetDescription>
          {data?.workflow?.length ? (
            <div className="flex flex-wrap items-center gap-1 pt-1">
              {data.workflow.map((s, i) => (
                <span key={s} className="flex items-center gap-1">
                  {i > 0 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
                  <Badge
                    variant={s === targetStage ? 'default' : 'outline'}
                    className="px-1.5 py-0 text-[10px] font-normal"
                  >
                    {stageLabel(s)}
                  </Badge>
                </span>
              ))}
            </div>
          ) : null}
        </SheetHeader>

        <div className="flex-1 overflow-auto px-5 py-4">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
            </div>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No KPIs mapped for this period.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">KRA / KPI</TableHead>
                  <TableHead className="w-16 text-right text-xs">Wt</TableHead>
                  <TableHead className="w-20 text-right text-xs">Target</TableHead>
                  <TableHead className="w-20 text-right text-xs">Achieved</TableHead>
                  <TableHead className="w-24 text-right text-xs">{stageLabel(targetStage)}</TableHead>
                  <TableHead className="w-24 text-right text-xs">Final</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.kpi_id} className={r.is_na ? 'opacity-60' : undefined}>
                    <TableCell className="py-2">
                      <div className="text-xs font-medium leading-tight">{r.kpi_name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {r.category_name} · {r.kra_name}
                        {r.is_na && <span className="ml-1 font-medium">· N/A</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{r.weightage ?? '—'}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{r.target_value ?? '—'}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{r.achieved_value ?? '—'}</TableCell>
                    <TableCell className="text-right">
                      <ScorePill value={scoreKey ? (r[scoreKey] as number | null) : null} />
                    </TableCell>
                    <TableCell className="text-right">
                      {r.final_score !== null
                        ? <ScorePill value={r.final_score} />
                        : <Lock className="ml-auto h-3 w-3 text-transparent" />}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {canWrite && rows.length > 0 && (
          <div className="space-y-2 border-t bg-muted/30 px-5 py-3">
            <Textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Remarks for this batch (optional) — stored on the audit trail."
              className="h-16 resize-none text-xs"
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {movable.length} row{movable.length === 1 ? '' : 's'} ready to move to {stageLabel(targetStage)}
                {locked > 0 && <> · {locked} locked or approved</>}
              </p>
              <Button size="sm" disabled={!movable.length || commit.isPending} onClick={move}>
                {commit.isPending ? 'Moving…' : `Move scorecard to ${stageLabel(targetStage)}`}
              </Button>
            </div>
            {commit.data?.skip_summary?.length ? (
              <ul className="space-y-0.5 text-[11px] text-muted-foreground">
                {commit.data.skip_summary.map((s) => (
                  <li key={s.reason}>{RUN_SKIP_LABELS[s.reason] ?? s.reason} — {s.count}</li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
