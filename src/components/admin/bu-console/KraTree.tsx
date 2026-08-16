/**
 * ADR-276 — KRA Tree.
 *
 * One indented cascade instead of a wide table: Organisation → Business Unit →
 * Department → Employee. Each level is fetched on expand and server-paged, so a
 * large org never loads the whole tree at once and nothing is silently cut —
 * a level that has more rows than one page shows a "Load more" control.
 *
 * A row is a KRA when it aggregates children, and a KPI when it is a
 * measurable leaf. Scores and review data are untouched; this view describes
 * targets only.
 */
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useBuConsoleCapability } from '@/hooks/useBuConsoleCapability';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  useKraTree,
  KRA_STATUS_LABELS,
  KRA_LEVEL_LABELS,
  type KraTreeRow,
  type KraStatus,
} from '@/hooks/useBuConsole';
import { ChevronRight, ChevronDown, Link2, Pencil, Plus, Archive, RefreshCw, Users } from 'lucide-react';

const STATUS_CLASS: Record<KraStatus, string> = {
  on_track: 'bg-primary/10 text-primary border-primary/20',
  achieved: 'bg-primary/15 text-primary border-primary/30',
  at_risk: 'bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-400',
  behind: 'bg-destructive/10 text-destructive border-destructive/20',
  dropped: 'bg-muted text-muted-foreground border-border',
  not_started: 'bg-muted text-muted-foreground border-border',
  not_set: 'bg-muted text-muted-foreground border-border',
};

export interface KraTreeScope {
  year: number;
  period: string | null;
  buIds: string[];
  deptIds: string[];
  categoryIds?: string[];
  search?: string;
}

interface Handlers {
  onAddChild: (parent: KraTreeRow) => void;
  onEdit: (row: KraTreeRow) => void;
  onArchive: (row: KraTreeRow) => void;
  onRollup: (row: KraTreeRow) => void;
  rollupPending: boolean;
}

const fmt = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(v);

const dateLabel = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : null;

function StatusChip({ row }: { row: KraTreeRow }) {
  const chip = (
    <Badge variant="outline" className={`text-[11px] font-medium ${STATUS_CLASS[row.status] ?? ''}`}>
      {KRA_STATUS_LABELS[row.status] ?? row.status}
    </Badge>
  );
  if (!row.status_reason && !row.status_is_manual) return chip;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild><span>{chip}</span></TooltipTrigger>
        <TooltipContent className="max-w-xs">
          {row.status_is_manual ? 'Set by hand. ' : ''}{row.status_reason ?? 'No note added.'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function KraTreeRowView({
  row, depth, scope, handlers,
}: { row: KraTreeRow; depth: number; scope: KraTreeScope; handlers: Handlers }) {
  const [open, setOpen] = useState(false);
  // ADR-284 — write affordances only for tiers the server accepts writes from.
  const { canWrite } = useBuConsoleCapability();
  const hasChildren = row.child_count > 0;
  const pct = row.progress_pct;
  const isLeaf = !hasChildren && row.goal_source === 'kpi_rollup';
  const window_ = [dateLabel(row.start_date), dateLabel(row.end_date)].filter(Boolean).join(' – ');

  return (
    <div>
      <div
        className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b px-2 py-2 hover:bg-muted/40"
        style={{ paddingLeft: 8 + depth * 20 }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            aria-label={hasChildren ? (open ? 'Collapse' : 'Expand') : 'No sub-KRAs'}
            disabled={!hasChildren}
            onClick={() => setOpen(o => !o)}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground disabled:opacity-30"
          >
            {hasChildren ? (open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />) : <span className="h-1 w-1 rounded-full bg-border" />}
          </button>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-medium">{row.title ?? row.kpi_name ?? 'Untitled'}</span>
              <Badge variant="secondary" className="text-[10px]">{isLeaf ? 'KPI' : 'KRA'}</Badge>
              <Badge variant="outline" className="text-[10px]">{KRA_LEVEL_LABELS[row.entity_level]}</Badge>
              {row.aligns_to_id && (
                <Badge variant="outline" className="gap-1 text-[10px]">
                  <Link2 className="h-3 w-3" />{row.aligns_to_title ?? 'Aligned'}
                </Badge>
              )}
              {window_ && <span className="text-[11px] text-muted-foreground">{window_}</span>}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {[row.category_name, row.kra_name, row.kpi_name].filter(Boolean).join(' › ') || 'No KRA link'}
              {row.owner_name ? ` · ${row.owner_name}` : ''}
              {row.department_name ? ` · ${row.department_name}` : row.business_unit_name ? ` · ${row.business_unit_name}` : ''}
              {row.mapped_employee_count > 0 && (
                <span className="ml-1 inline-flex items-center gap-1">
                  <Users className="inline h-3 w-3" />{row.mapped_employee_count}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden w-24 text-right text-xs tabular-nums text-muted-foreground sm:block">
            {fmt(row.current_value)} / {fmt(row.target_value)}{row.unit ? ` ${row.unit}` : ''}
          </div>
          <StatusChip row={row} />
          <div className="w-28">
            {pct === null ? (
              <span className="text-[11px] text-muted-foreground">Not measurable yet</span>
            ) : (
              <div className="flex items-center gap-2">
                <Progress value={pct} className="h-1.5" />
                <span className="w-10 text-right text-xs tabular-nums">{pct}%</span>
              </div>
            )}
          </div>
          {canWrite && (
          <div className="flex shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <Button
              variant="ghost" size="sm" title={row.goal_source === 'manual' ? 'Entered manually' : 'Recompute progress'}
              disabled={row.goal_source === 'manual' || handlers.rollupPending}
              onClick={() => handlers.onRollup(row)}
            >
              <RefreshCw className={`h-4 w-4 ${handlers.rollupPending ? 'animate-spin' : ''}`} />
            </Button>
            <Button variant="ghost" size="sm" title="Add a KRA underneath" onClick={() => handlers.onAddChild(row)}>
              <Plus className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" title="Edit" onClick={() => handlers.onEdit(row)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" title="Archive" onClick={() => handlers.onArchive(row)}>
              <Archive className="h-4 w-4" />
            </Button>
          </div>
          )}
        </div>
      </div>

      {open && hasChildren && (
        <KraTreeLevel parentId={row.id} depth={depth + 1} scope={scope} handlers={handlers} />
      )}
    </div>
  );
}

function KraTreeLevel({
  parentId, depth, scope, handlers,
}: { parentId: string | null; depth: number; scope: KraTreeScope; handlers: Handlers }) {
  const [pages, setPages] = useState(1);
  const PAGE_SIZE = 100;

  const args = useMemo(
    () => ({
      year: scope.year,
      period: scope.period,
      parentId,
      buIds: scope.buIds,
      deptIds: scope.deptIds,
      categoryIds: scope.categoryIds,
      search: scope.search,
      page: 1,
      // One growing window instead of separate pages: clicking "Load more"
      // widens the window so no intermediate page can be skipped.
      pageSize: PAGE_SIZE * pages,
    }),
    [scope, parentId, pages],
  );

  const first = useKraTree(args);

  if (first.isLoading) {
    return (
      <div className="space-y-2 p-2" style={{ paddingLeft: 8 + depth * 20 }}>
        {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
      </div>
    );
  }

  if (first.data && !first.data.authorized) {
    return (
      <Alert variant="destructive" className="m-2">
        <AlertTitle>Access denied</AlertTitle>
        <AlertDescription>You do not have permission to view this tree.</AlertDescription>
      </Alert>
    );
  }

  const rows = first.data?.rows ?? [];
  const total = first.data?.total ?? 0;

  if (rows.length === 0) {
    return (
      <p className="px-2 py-4 text-sm text-muted-foreground" style={{ paddingLeft: 8 + depth * 20 }}>
        {parentId ? 'Nothing underneath this yet.' : 'No KRAs in this scope yet.'}
      </p>
    );
  }

  return (
    <div>
      {rows.map(r => (
        <KraTreeRowView key={r.id} row={r} depth={depth} scope={scope} handlers={handlers} />
      ))}
      {rows.length < total && (
        <div className="px-2 py-2" style={{ paddingLeft: 8 + depth * 20 }}>
          <Button variant="outline" size="sm" onClick={() => setPages(p => p + 1)} disabled={first.isFetching}>
            {first.isFetching ? 'Loading…' : `Load more (${rows.length} of ${total})`}
          </Button>
        </div>
      )}
    </div>
  );
}

export function KraTree({ scope, handlers }: { scope: KraTreeScope; handlers: Handlers }) {
  return (
    <div className="rounded-md border">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b bg-muted/40 px-2 py-2 text-xs font-medium text-muted-foreground">
        <span className="pl-8">KRA / KPI</span>
        <span className="pr-2">Progress</span>
      </div>
      <KraTreeLevel parentId={null} depth={0} scope={scope} handlers={handlers} />
    </div>
  );
}
