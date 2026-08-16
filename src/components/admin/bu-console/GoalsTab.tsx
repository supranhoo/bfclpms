/**
 * ADR-276 — KRA Tree tab of the Performance Console.
 *
 * Replaces the old wide "Goals" table with a single indented cascade:
 * Organisation → Business Unit → Department → Employee. Naming follows the
 * business: everything here is a KRA (an aggregate) or a KPI (a measurable
 * leaf) — the word "goal" is gone from the UI, while the underlying storage
 * and roll-up rules are unchanged.
 */
import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';
import { useGoalRollup, useGoalArchive, type KraTreeRow } from '@/hooks/useBuConsole';
import { GoalFormDialog, type GoalFormSeed } from './GoalFormDialog';
import { KraTree, type KraTreeScope } from './KraTree';
import { useBuConsoleCapability } from '@/hooks/useBuConsoleCapability';
import { Plus, Search } from 'lucide-react';

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
  const [formOpen, setFormOpen] = useState(false);
  const { canWrite } = useBuConsoleCapability();
  const [editing, setEditing] = useState<GoalFormSeed | null>(null);
  const [parent, setParent] = useState<GoalFormSeed | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<KraTreeRow | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const rollup = useGoalRollup();
  const archive = useGoalArchive();

  const scope: KraTreeScope = useMemo(
    () => ({ year, period, buIds, deptIds, search: search || undefined }),
    [year, period, buIds, deptIds, search],
  );

  const handlers = useMemo(
    () => ({
      onAddChild: (p: KraTreeRow) => { setEditing(null); setParent(p as unknown as GoalFormSeed); setFormOpen(true); },
      onEdit: (r: KraTreeRow) => { setEditing(r as unknown as GoalFormSeed); setParent(null); setFormOpen(true); },
      onArchive: (r: KraTreeRow) => setArchiveTarget(r),
      onRollup: (r: KraTreeRow) => rollup.mutate({ goalId: r.id, persist: true }),
      rollupPending: rollup.isPending,
    }),
    [rollup],
  );

  if (!active) {
    return (
      <Alert>
        <AlertTitle>Apply a scope first</AlertTitle>
        <AlertDescription>Pick a period and any business units, then load the console to see the KRA tree.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base">KRA Tree</CardTitle>
            <CardDescription>
              One cascade from the organisation down to an employee. A KRA holds other KRAs or KPIs; a KPI
              is the measurable leaf and can read its progress from live review data. Employee scoring is
              unchanged — this view describes targets, it does not grade anyone.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="w-56 pl-8"
                placeholder="Search top-level KRAs…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') setSearch(searchInput); }}
                onBlur={() => setSearch(searchInput)}
              />
            </div>
            {canWrite && (
              <Button size="sm" onClick={() => { setEditing(null); setParent(null); setFormOpen(true); }}>
                <Plus className="mr-2 h-4 w-4" />New KRA
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <KraTree scope={scope} handlers={handlers} />
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
        title="Archive this KRA?"
        description={`“${archiveTarget?.title ?? archiveTarget?.kpi_name ?? ''}” will be hidden from the console. No review data or scores are affected.`}
        confirmLabel="Archive"
        isLoading={archive.isPending}
        onConfirm={() => {
          if (archiveTarget) archive.mutate(archiveTarget.id);
          setArchiveTarget(null);
        }}
      />
    </div>
  );
}
