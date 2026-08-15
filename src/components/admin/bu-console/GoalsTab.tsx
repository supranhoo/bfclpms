/**
 * ADR-267 — Goals tab of the BU Performance Console.
 *
 * Goals are shown as they are modelled: a category-anchored top-level goal
 * (the KRA-level intent) with its sub-goals nested underneath. Roll-up is
 * weighted — by employee weightage for KPI-backed goals, by declared weight
 * for parents summarising their children — never a plain average.
 */
import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';
import {
  useBuGoals,
  useGoalRollup,
  useGoalArchive,
  goalProgressPercent,
  GOAL_SUMMARY_RULE_LABELS,
  GOAL_SOURCE_LABELS,
  type BuGoalRow,
} from '@/hooks/useBuConsole';
import { GoalFormDialog } from './GoalFormDialog';
import { Plus, RefreshCw, Pencil, Archive, CornerDownRight } from 'lucide-react';

interface Props {
  year: number;
  period: string | null;
  buIds: string[];
  deptIds: string[];
  buOptions: { value: string; label: string }[];
  deptOptions: { value: string; label: string }[];
  /** Null until the admin applies a scope — nothing loads before that. */
  active: boolean;
}

export function GoalsTab({ year, period, buIds, deptIds, buOptions, deptOptions, active }: Props) {
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<BuGoalRow | null>(null);
  const [parent, setParent] = useState<BuGoalRow | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<BuGoalRow | null>(null);

  const args = useMemo(
    () => (active ? { year, period, buIds, deptIds, page } : null),
    [active, year, period, buIds, deptIds, page],
  );

  const { data, isFetching } = useBuGoals(args);
  const rollup = useGoalRollup();
  const archive = useGoalArchive();

  const openNew = () => { setEditing(null); setParent(null); setFormOpen(true); };
  const openChild = (g: BuGoalRow) => { setEditing(null); setParent(g); setFormOpen(true); };
  const openEdit = (g: BuGoalRow) => { setEditing(g); setParent(null); setFormOpen(true); };

  if (!active) {
    return (
      <Alert>
        <AlertTitle>Apply a scope first</AlertTitle>
        <AlertDescription>Pick a period and any business units, then load the console to see its goals.</AlertDescription>
      </Alert>
    );
  }

  const rows = data?.rows ?? [];
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.page_size ?? 200)));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">Goals</CardTitle>
            <CardDescription>
              A goal sits inside a KRA category and can hold sub-goals — for example one production goal with a
              sub-goal per plant. Employee scores stay on the existing 0–5 scale; a goal describes the target,
              it does not grade anyone.
            </CardDescription>
          </div>
          <Button size="sm" onClick={openNew}><Plus className="mr-2 h-4 w-4" />New goal</Button>
        </CardHeader>
        <CardContent>
          {isFetching && <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>}

          {data && !data.authorized && (
            <Alert variant="destructive">
              <AlertTitle>Access denied</AlertTitle>
              <AlertDescription>You do not have permission to view goals.</AlertDescription>
            </Alert>
          )}

          {data?.authorized && !isFetching && rows.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">No goals in this scope yet.</p>
          )}

          {data?.authorized && !isFetching && rows.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Goal</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead className="text-right">Start</TableHead>
                    <TableHead className="text-right">Current</TableHead>
                    <TableHead className="text-right">Target</TableHead>
                    <TableHead className="w-40">Progress</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(g => {
                    const pct = goalProgressPercent(g);
                    const isChild = (g.depth ?? 0) > 0;
                    return (
                      <TableRow key={g.id} className={isChild ? 'bg-muted/30' : undefined}>
                        <TableCell>
                          <div className={isChild ? 'pl-6' : undefined}>
                            <div className="flex items-center gap-1 font-medium">
                              {isChild && <CornerDownRight className="h-3 w-3 text-muted-foreground" />}
                              {g.title ?? g.kpi_name ?? 'Untitled goal'}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {[g.category_name, g.kra_name, g.kpi_name].filter(Boolean).join(' › ') || 'No KRA link'}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          <div>{g.department_name ?? g.business_unit_name ?? 'Organisation'}</div>
                          <div className="text-xs text-muted-foreground">
                            {g.review_period ?? 'Full year'} {g.review_year}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{g.start_value ?? '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">{g.current_value ?? '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {g.target_value ?? '—'}{g.unit ? ` ${g.unit}` : ''}
                        </TableCell>
                        <TableCell>
                          {pct === null ? (
                            <span className="text-xs text-muted-foreground">Not measurable yet</span>
                          ) : (
                            <div className="space-y-1">
                              <Progress value={pct} className="h-2" />
                              <span className="text-xs text-muted-foreground">{pct}%</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          <Badge variant="secondary">{GOAL_SOURCE_LABELS[g.goal_source]}</Badge>
                          <div className="mt-1 text-muted-foreground">{GOAL_SUMMARY_RULE_LABELS[g.subperiod_summary_rule]}</div>
                          {g.goal_source === 'child_rollup' && (
                            <div className="text-muted-foreground">weight {g.weight ?? 1}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={g.goal_source === 'manual' || rollup.isPending}
                            title={g.goal_source === 'manual' ? 'This goal is entered manually' : 'Recompute this goal'}
                            onClick={() => rollup.mutate({ goalId: g.id, persist: true })}
                          >
                            <RefreshCw className={`h-4 w-4 ${rollup.isPending ? 'animate-spin' : ''}`} />
                          </Button>
                          {!isChild && (
                            <Button variant="ghost" size="sm" onClick={() => openChild(g)} title="Add sub-goal">
                              <Plus className="h-4 w-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => openEdit(g)} title="Edit goal">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setArchiveTarget(g)} title="Archive goal">
                            <Archive className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {data?.authorized && totalPages > 1 && (
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Page {data.page} of {totalPages} · {data.total} top-level goals</span>
              <div className="space-x-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <GoalFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        goal={editing}
        parent={parent}
        year={year}
        period={period}
        buOptions={buOptions}
        deptOptions={deptOptions}
      />

      <ConfirmDestructiveDialog
        open={!!archiveTarget}
        onCancel={() => setArchiveTarget(null)}
        title="Archive this goal?"
        description={`“${archiveTarget?.title ?? archiveTarget?.kpi_name ?? ''}” will be hidden from the console. No review data or scores are affected.`}
        confirmLabel="Archive goal"
        isLoading={archive.isPending}
        onConfirm={() => {
          if (archiveTarget) archive.mutate(archiveTarget.id);
          setArchiveTarget(null);
        }}
      />
    </div>
  );
}
