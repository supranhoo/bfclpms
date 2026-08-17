/**
 * ADR-259 — Category folders → KRA list → KPI list drilldown.
 * Pure presentation: it receives an already-loaded tree and reports selection.
 *
 * ADR-264 — the KRA and KPI lists are virtualized, so a category holding
 * thousands of rows renders (and scrolls) without dropping any of them.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ChevronRight,
  ChevronLeft,
  Users,
  Layers,
  AlertTriangle,
  Wrench,
  Sparkles,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { ConsoleMetricRow, ConsoleMetricHeader } from './ConsoleMetricRow';
import { ScorePill } from './ScorePill';
import { lookalikeCounts } from './lookalikeTitles';
import { resolveKpiDueState } from '@/lib/review/kpiDueForPeriod';
import type {
  BuConsoleCategoryNode,
  BuConsoleKraNode,
  BuConsoleKpiNode,
} from '@/hooks/useBuConsole';

/** Lists shorter than this render normally — virtualization only pays off past it. */
const VIRTUALIZE_ABOVE = 40;

function VirtualRows<T>({
  items,
  estimateSize,
  renderRow,
  maxHeightClass,
}: {
  items: T[];
  estimateSize: number;
  renderRow: (item: T, index: number) => React.ReactNode;
  maxHeightClass: string;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan: 12,
  });

  if (items.length <= VIRTUALIZE_ABOVE) {
    return <div className="divide-y">{items.map((item, i) => renderRow(item, i))}</div>;
  }

  return (
    <div ref={parentRef} className={cn('overflow-y-auto', maxHeightClass)}>
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map(v => (
          <div
            key={v.key}
            ref={virtualizer.measureElement}
            data-index={v.index}
            className="absolute left-0 top-0 w-full border-b"
            style={{ transform: `translateY(${v.start}px)` }}
          >
            {renderRow(items[v.index], v.index)}
          </div>
        ))}
      </div>
    </div>
  );
}

interface Props {
  categories: BuConsoleCategoryNode[];
  selectedCategoryId: string | null;
  selectedKraKey: string | null;
  onSelectCategory: (categoryId: string) => void;
  /** null collapses the open KRA (ADR-278). */
  onSelectKra: (kraKey: string | null) => void;
  onSelectKpi: (
    categoryId: string,
    kraName: string,
    kpi: BuConsoleKpiNode,
    variantKey?: string | null,
  ) => void;
  /** ADR-273 — opens the Text Split screen filtered to this KPI's raw text. */
  onFixTextSplit?: (kpi: BuConsoleKpiNode) => void;
  /** ADR-283 — scope / drill path shown on the category strip row. */
  breadcrumb?: ReactNode;
  /**
   * ADR-297 — a slim review counter line rendered above the KPI list of the
   * open KRA. Supplied by the page so the tree stays pure.
   */
  renderKraSummary?: (kra: BuConsoleKraNode, categoryId: string) => ReactNode;
  /**
   * ADR-297 — one row per KPI: the employee cells for a KPI open *inside* that
   * KPI's row instead of as a second list under the KRA.
   */
  renderKpiPanel?: (
    kpi: BuConsoleKpiNode,
    kra: BuConsoleKraNode,
    categoryId: string,
  ) => ReactNode;
  /** ADR-296 — selected review month/year used to resolve frequency due state. */
  period?: string;
  year?: number;
  /** ADR-296 — hide KPIs that are not open for submission this month. */
  dueOnly?: boolean;
}

const fmtScore = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : Number(v).toFixed(2);

/**
 * ADR-270 — one row per structured KPI title. When rows behind the title
 * disagree on definition or weightage the row says so and the variants can be
 * expanded and opened individually; nothing is collapsed silently.
 */
function KpiRow({
  kpi,
  index,
  onOpen,
  lookalikeCount,
  onFixTextSplit,
  dueState,
  panel,
  expanded,
  onToggle,
  expandable,
}: {
  kpi: BuConsoleKpiNode;
  index: number;
  onOpen: (variantKey?: string | null) => void;
  lookalikeCount?: number;
  onFixTextSplit?: (kpi: BuConsoleKpiNode) => void;
  dueState?: { due: boolean; frequency: string | null; cycleLabel: string | null };
  /** ADR-297 — the people cells for this KPI, rendered inline when expanded. */
  panel?: ReactNode;
  expanded?: boolean;
  onToggle?: () => void;
  /** True when this row can open a people panel, even while collapsed. */
  expandable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const weights = kpi.weightage_values ?? [];
  const variantCount = kpi.variant_count ?? 1;
  const hasVariance = variantCount > 1 || weights.length > 1;
  const isLookalike = (lookalikeCount ?? 0) > 1;
  const panelId = `kpi-people-${kpi.kpi_key.replace(/[^\w-]/g, '_')}`;

  return (
    <div>
      <ConsoleMetricRow
        index={index}
        title={kpi.kpi_title || kpi.kpi_name}
        subtitle={
          <span className="flex flex-wrap items-center gap-1">
            {kpi.kpi_description ? (
              <span className="line-clamp-1 text-muted-foreground">{kpi.kpi_description}</span>
            ) : (
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {kpi.employee_count} employee{kpi.employee_count === 1 ? '' : 's'} mapped
              </span>
            )}
            {kpi.is_org_level && (
              <Badge variant="secondary" className="h-4 px-1 text-[10px]">Org-level</Badge>
            )}
            {!kpi.is_structured && (
              <Badge variant="outline" className="h-4 px-1 text-[10px]">Unsplit text</Badge>
            )}
            {dueState && !dueState.due && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center gap-1 rounded-full border border-muted-foreground/30 bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
                      Not due · {dueState.frequency}
                      {dueState.cycleLabel ? ` (${dueState.cycleLabel})` : ''}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    This KPI is {String(dueState.frequency).toLowerCase()} and is not open for data
                    submission in the selected month. It stays visible on the employee dashboard and
                    becomes submittable in the closing month of its cycle
                    {dueState.cycleLabel ? ` (${dueState.cycleLabel})` : ''}.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {isLookalike && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="h-3 w-3" />
                      Possible duplicate
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    {lookalikeCount} KPI rows under this KRA have titles that only differ by
                    scoring text, an incentive note or month brackets. That usually means the
                    KPI text was split incorrectly — fix the split so they group as one KPI.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </span>
        }
        onClick={() => (expandable ? onToggle?.() : onOpen(null))}
        expandable={!!expandable}
        expanded={!!expandable && !!expanded}
        ariaControls={expandable ? panelId : undefined}
        hideMetricLabels
        metrics={[
          { label: 'Employees', value: kpi.employee_count },
          {
            label: 'Weightage',
            value:
              weights.length === 0
                ? '—'
                : weights.length === 1
                  ? Number(weights[0]).toFixed(2)
                  : `${weights.length} values`,
          },
          { label: 'Avg score', value: <ScorePill value={kpi.avg_score} /> },
        ]}
        trailing={
          <span className="flex items-center gap-2">
            {onFixTextSplit && (isLookalike || !kpi.is_structured) && (
              <span
                role="button"
                tabIndex={0}
                aria-label={`Fix the text split for ${kpi.kpi_title || kpi.kpi_name}`}
                onClick={(e) => { e.stopPropagation(); onFixTextSplit(kpi); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onFixTextSplit(kpi); }
                }}
                className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
              >
                <Wrench className="h-3 w-3" />
                Fix text split
              </span>
            )}
            {hasVariance && (
              <span
                role="button"
                tabIndex={0}
                aria-label={`Show ${variantCount} variants of ${kpi.kpi_title || kpi.kpi_name}`}
                onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setOpen(o => !o); }
                }}
                className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400"
              >
                <Layers className="h-3 w-3" />
                {variantCount} variant{variantCount === 1 ? '' : 's'}
              </span>
            )}
            <span className="flex items-center gap-1 text-xs font-medium text-primary opacity-60 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              {expandable ? (
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`Open details for ${kpi.kpi_title || kpi.kpi_name}`}
                  onClick={(e) => { e.stopPropagation(); onOpen(null); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onOpen(null); }
                  }}
                  className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5"
                >
                  Open <ChevronRight className="h-4 w-4" />
                </span>
              ) : (
                <>Open <ChevronRight className="h-4 w-4" /></>
              )}
            </span>
          </span>
        }
      />

      {expandable && expanded && panel && (
        <div id={panelId} className="border-t bg-muted/30">
          {panel}
        </div>
      )}

      {open && (
        <ul className="space-y-1 bg-muted/40 px-4 py-2">
          {kpi.variants.map((v, vi) => (
            <li key={v.variant_key}>
              <button
                type="button"
                onClick={() => onOpen(v.variant_key)}
                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-xs hover:bg-background"
              >
                <span className="min-w-0">
                  <span className="font-medium">Variant {vi + 1}</span>
                  <span className="ml-2 text-muted-foreground">
                    {v.employee_count} employee{v.employee_count === 1 ? '' : 's'}
                    {v.target_value !== null && v.target_value !== undefined
                      ? ` · target ${v.target_value}${v.uom ? ` ${v.uom}` : ''}`
                      : ''}
                  </span>
                  {(v.formula || v.scoring_logic) && (
                    <span className="block truncate text-muted-foreground">
                      {v.formula ? `Formula: ${v.formula}` : `Scoring: ${v.scoring_logic}`}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-primary">Open</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Horizontal category strip with pills and overflow-aware scroll arrows. */
function CategoryStrip({
  categories,
  selectedCategoryId,
  onSelectCategory,
  breadcrumb,
}: {
  categories: BuConsoleCategoryNode[];
  selectedCategoryId: string | null;
  onSelectCategory: (id: string) => void;
  breadcrumb?: ReactNode;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState({ left: false, right: false });

  const measure = () => {
    const el = trackRef.current;
    if (!el) return;
    setOverflow({
      left: el.scrollLeft > 4,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
    });
  };

  useEffect(() => {
    measure();
    const el = trackRef.current;
    if (!el) return;
    el.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      el.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories.length]);

  const nudge = (dir: -1 | 1) =>
    trackRef.current?.scrollBy({ left: dir * 240, behavior: 'smooth' });

  return (
    <div className="relative rounded-lg border bg-card p-1.5">
      {breadcrumb && <div className="px-2 pb-1 pt-0.5">{breadcrumb}</div>}
      {overflow.left && (
        <button
          type="button"
          aria-label="Scroll categories left"
          onClick={() => nudge(-1)}
          className="absolute left-1 top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-sm hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}
      {overflow.right && (
        <button
          type="button"
          aria-label="Scroll categories right"
          onClick={() => nudge(1)}
          className="absolute right-1 top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-sm hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
      {overflow.left && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 rounded-l-lg bg-gradient-to-r from-card to-transparent"
        />
      )}
      {overflow.right && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 rounded-r-lg bg-gradient-to-l from-card to-transparent"
        />
      )}
      <div
        ref={trackRef}
        role="tablist"
        aria-label="KPI categories"
        className="flex snap-x gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {categories.map(c => {
          const active = c.category_id === selectedCategoryId;
          return (
            <button
              key={c.category_id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSelectCategory(c.category_id)}
              className={cn(
                'flex min-h-11 shrink-0 snap-start items-center gap-2 whitespace-nowrap rounded-md px-3 text-sm transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {c.category_name}
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
                  active
                    ? 'bg-primary-foreground/20 text-primary-foreground'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {c.kpi_count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Right-hand context panel so a thin category doesn't leave a dead canvas. */
function CategoryGlance({ category }: { category: BuConsoleCategoryNode }) {
  const summary = useMemo(() => {
    const kpis = category.kras.flatMap(k => k.kpis);
    const scored = kpis.filter(k => k.avg_score !== null && k.avg_score !== undefined);
    const avg =
      scored.length > 0
        ? scored.reduce((n, k) => n + Number(k.avg_score), 0) / scored.length
        : null;
    return {
      top: [...kpis].sort((a, b) => (b.employee_count ?? 0) - (a.employee_count ?? 0)).slice(0, 5),
      avg,
      unsplit: kpis.filter(k => !k.is_structured).length,
      orgLevel: kpis.filter(k => k.is_org_level).length,
      unscored: kpis.length - scored.length,
    };
  }, [category]);

  return (
    <Card className="hidden xl:block">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden />
          <p className="text-sm font-semibold">Category at a glance</p>
        </div>

        <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
          <span className="text-xs text-muted-foreground">Average score</span>
          <ScorePill value={summary.avg} />
        </div>

        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Top KPIs by employee impact
          </p>
          {summary.top.length === 0 ? (
            <p className="text-xs text-muted-foreground">No KPIs in this category.</p>
          ) : (
            <ul className="space-y-1.5">
              {summary.top.map(k => (
                <li key={k.kpi_key} className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate">{k.kpi_title || k.kpi_name}</span>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-medium tabular-nums text-muted-foreground">
                    <Users className="h-3 w-3" aria-hidden />
                    {k.employee_count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <dl className="grid grid-cols-3 gap-2 border-t pt-3 text-center">
          {[
            { label: 'Org-level', value: summary.orgLevel },
            { label: 'Unsplit text', value: summary.unsplit },
            { label: 'Unscored', value: summary.unscored },
          ].map(x => (
            <div key={x.label}>
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {x.label}
              </dt>
              <dd className="text-sm font-semibold tabular-nums">{x.value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

export function BuConsoleTree({
  categories,
  selectedCategoryId,
  selectedKraKey,
  onSelectCategory,
  onSelectKra,
  onSelectKpi,
  onFixTextSplit,
  breadcrumb,
  renderKraSummary,
  renderKpiPanel,
  period,
  year,
  dueOnly = false,
}: Props) {
  const category = categories.find(c => c.category_id === selectedCategoryId) ?? null;
  // ADR-297 — only one KPI's people cells are open at a time.
  const [openKpiKey, setOpenKpiKey] = useState<string | null>(null);
  const openKra: BuConsoleKraNode | null =
    category?.kras.find(k => k.kra_key === selectedKraKey) ?? null;
  useEffect(() => { setOpenKpiKey(null); }, [selectedKraKey, selectedCategoryId]);
  // ADR-296 — due state is resolved once per open KRA; the console never hides
  // a KPI unless the user asked for the "due this month" view.
  const dueStates = useMemo(() => {
    const map = new Map<string, ReturnType<typeof resolveKpiDueState>>();
    if (!period || !year) return map;
    for (const kpi of openKra?.kpis ?? []) {
      map.set(
        kpi.kpi_key,
        resolveKpiDueState(kpi.frequencies, kpi.frequency_cycle_starts, period, year),
      );
    }
    return map;
  }, [openKra, period, year]);
  // ADR-273 — computed for the expanded KRA only, so a mis-split title is
  // visible next to the row it duplicates instead of looking like a second KPI.
  const lookalikes = lookalikeCounts(
    (openKra?.kpis ?? []).map(k => ({ key: k.kpi_key, title: k.kpi_title || k.kpi_name })),
  );

  return (
    <div className="space-y-2">
      {categories.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm font-medium">No KPIs found for this scope and period</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Widen the scope or pick another review period, then load the console again.
          </p>
        </div>
      ) : (
        <CategoryStrip
          categories={categories}
          selectedCategoryId={selectedCategoryId}
          onSelectCategory={onSelectCategory}
          breadcrumb={breadcrumb}
        />
      )}

      {category && (
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {category.category_name} · KRAs
              </p>
              <p className="text-xs text-muted-foreground">
                {category.kra_count} KRAs · {category.kpi_count} KPIs
              </p>
            </div>
            <ConsoleMetricHeader labels={['KPI count', 'Employee impact', 'Avg score']} />
            <VirtualRows
              items={category.kras}
              estimateSize={56}
              maxHeightClass="max-h-[420px]"
              renderRow={(k, i) => {
                const employees = k.kpis.reduce((n, kpi) => n + (kpi.employee_count ?? 0), 0);
                const scored = k.kpis.filter(
                  kpi => kpi.avg_score !== null && kpi.avg_score !== undefined,
                );
                const kraAvg =
                  scored.length > 0
                    ? scored.reduce((n, kpi) => n + Number(kpi.avg_score), 0) / scored.length
                    : null;
                const isOpen = k.kra_key === selectedKraKey;
                const panelId = `kra-panel-${k.kra_key.replace(/[^\w-]/g, '_')}`;
                return (
                  <div key={k.kra_key}>
                    <ConsoleMetricRow
                      index={i + 1}
                      title={k.kra_name}
                      subtitle={`${k.kpi_count} mapped KPI${k.kpi_count === 1 ? '' : 's'} · ${employees} employee${employees === 1 ? '' : 's'}`}
                      selected={isOpen}
                      onClick={() => onSelectKra(isOpen ? null : k.kra_key)}
                      hideMetricLabels
                      expandable
                      expanded={isOpen}
                      ariaControls={panelId}
                      metrics={[
                        { label: 'KPI count', value: k.kpi_count },
                        {
                          label: 'Employee impact',
                          value: (
                            <span className="inline-flex items-center justify-end gap-1">
                              <Users className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                              {employees}
                            </span>
                          ),
                        },
                        {
                          label: 'Avg score',
                          value: <ScorePill value={kraAvg} withBar className="items-end" />,
                        },
                      ]}
                    />
                    {isOpen && (
                      <div
                        id={panelId}
                        className="relative border-t bg-muted/40 py-2 pl-3 pr-2 shadow-[inset_0_6px_8px_-8px_hsl(var(--foreground)/0.35)] sm:pl-8"
                      >
                        <span
                          aria-hidden
                          className="pointer-events-none absolute bottom-4 left-4 top-0 hidden w-px bg-border sm:block"
                        />
                        <div className="space-y-2">
                        {isOpen && renderKraSummary ? renderKraSummary(k, category.category_id) : null}
                        {(() => {
                        const visibleKpis = dueOnly
                          ? k.kpis.filter(kpi => dueStates.get(kpi.kpi_key)?.due !== false)
                          : k.kpis;
                        const hiddenCount = k.kpis.length - visibleKpis.length;
                        return (
                        <div className="overflow-hidden rounded-md border bg-background shadow-sm">
                          <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-1.5">
                            <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              KPIs · {visibleKpis.length}
                              {hiddenCount > 0 && (
                                <span className="ml-1 normal-case tracking-normal">
                                  ({hiddenCount} not due this month hidden)
                                </span>
                              )}
                            </p>
                            <span className="hidden shrink-0 gap-3 sm:flex">
                              {['Employees', 'Weightage', 'Avg score'].map(l => (
                                <span
                                  key={l}
                                  className="w-[92px] text-right text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                                >
                                  {l}
                                </span>
                              ))}
                              <span className="w-[120px]" aria-hidden />
                            </span>
                          </div>
                          {visibleKpis.length === 0 ? (
                            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                              {k.kpis.length === 0
                                ? 'No KPIs mapped under this KRA for the loaded scope.'
                                : 'No KPIs under this KRA are due for data submission this month.'}
                            </p>
                          ) : (
                            <div className="max-h-[420px] divide-y overflow-y-auto">
                              {visibleKpis.map((kpi, ki) => (
                                <KpiRow
                                  key={kpi.kpi_key}
                                  kpi={kpi}
                                  index={ki + 1}
                                  lookalikeCount={lookalikes.get(kpi.kpi_key)}
                                  dueState={dueStates.get(kpi.kpi_key)}
                                  onFixTextSplit={onFixTextSplit}
                                  expandable={!!renderKpiPanel}
                                  expanded={openKpiKey === kpi.kpi_key}
                                  onToggle={() =>
                                    setOpenKpiKey(prev => (prev === kpi.kpi_key ? null : kpi.kpi_key))
                                  }
                                  panel={
                                    renderKpiPanel && openKpiKey === kpi.kpi_key
                                      ? renderKpiPanel(kpi, k, category.category_id)
                                      : undefined
                                  }
                                  onOpen={(variantKey) =>
                                    onSelectKpi(category.category_id, k.kra_name, kpi, variantKey)
                                  }
                                />
                              ))}
                            </div>
                          )}
                        </div>
                        );
                        })()}
                        </div>
                      </div>
                    )}
                  </div>
                );
              }}
            />
          </CardContent>
        </Card>
        <CategoryGlance category={category} />
        </div>
      )}
    </div>
  );
}