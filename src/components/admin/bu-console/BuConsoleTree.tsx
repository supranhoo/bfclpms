/**
 * ADR-259 — Category folders → KRA list → KPI list drilldown.
 * Pure presentation: it receives an already-loaded tree and reports selection.
 *
 * ADR-264 — the KRA and KPI lists are virtualized, so a category holding
 * thousands of rows renders (and scrolls) without dropping any of them.
 */
import { useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronRight, Users, Layers, AlertTriangle, Wrench } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { ConsoleMetricRow, ConsoleMetricHeader } from './ConsoleMetricRow';
import { lookalikeCounts } from './lookalikeTitles';
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
  onSelectKra: (kraKey: string) => void;
  onSelectKpi: (
    categoryId: string,
    kraName: string,
    kpi: BuConsoleKpiNode,
    variantKey?: string | null,
  ) => void;
  /** ADR-273 — opens the Text Split screen filtered to this KPI's raw text. */
  onFixTextSplit?: (kpi: BuConsoleKpiNode) => void;
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
}: {
  kpi: BuConsoleKpiNode;
  index: number;
  onOpen: (variantKey?: string | null) => void;
  lookalikeCount?: number;
  onFixTextSplit?: (kpi: BuConsoleKpiNode) => void;
}) {
  const [open, setOpen] = useState(false);
  const weights = kpi.weightage_values ?? [];
  const variantCount = kpi.variant_count ?? 1;
  const hasVariance = variantCount > 1 || weights.length > 1;
  const isLookalike = (lookalikeCount ?? 0) > 1;

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
        onClick={() => onOpen(null)}
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
          { label: 'Avg score', value: fmtScore(kpi.avg_score) },
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
            <span className="flex items-center gap-1 text-xs font-medium text-primary">
              Open <ChevronRight className="h-4 w-4" />
            </span>
          </span>
        }
      />

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

export function BuConsoleTree({
  categories,
  selectedCategoryId,
  selectedKraKey,
  onSelectCategory,
  onSelectKra,
  onSelectKpi,
  onFixTextSplit,
}: Props) {
  const category = categories.find(c => c.category_id === selectedCategoryId) ?? null;
  const kra: BuConsoleKraNode | null =
    category?.kras.find(k => k.kra_key === selectedKraKey) ?? null;
  // ADR-273 — computed per KRA list, so a mis-split title is visible next to
  // the row it duplicates instead of looking like a second KPI.
  const lookalikes = lookalikeCounts(
    (kra?.kpis ?? []).map(k => ({ key: k.kpi_key, title: k.kpi_title || k.kpi_name })),
  );

  return (
    <div className="space-y-3">
      {/* Category tab strip — one scrollable row instead of a wrapped chip grid */}
      {categories.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm font-medium">No KPIs found for this scope and period</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Widen the scope or pick another review period, then load the console again.
          </p>
        </div>
      ) : (
        <div className="relative">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-gradient-to-r from-background to-transparent"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-background to-transparent"
          />
          <div
            role="tablist"
            aria-label="KPI categories"
            className="flex snap-x gap-1 overflow-x-auto border-b px-1 pb-px [scrollbar-width:thin]"
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
                  'flex min-h-11 shrink-0 snap-start items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm transition-colors',
                  active
                    ? 'border-primary font-semibold text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {c.category_name}
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums',
                    active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {c.kpi_count}
                </span>
              </button>
            );
          })}
          </div>
        </div>
      )}

      {/* KRA list */}
      {category && (
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
            <ConsoleMetricHeader labels={['KPI count', 'Employee impact']} />
            <VirtualRows
              items={category.kras}
              estimateSize={56}
              maxHeightClass="max-h-[420px]"
              renderRow={(k, i) => {
                const employees = k.kpis.reduce((n, kpi) => n + (kpi.employee_count ?? 0), 0);
                const isOpen = k.kra_key === selectedKraKey;
                const panelId = `kra-panel-${k.kra_key.replace(/[^\w-]/g, '_')}`;
                return (
                  <div key={k.kra_key}>
                    <ConsoleMetricRow
                      index={i + 1}
                      title={k.kra_name}
                      subtitle={`${k.kpi_count} mapped KPI${k.kpi_count === 1 ? '' : 's'}`}
                      selected={isOpen}
                      onClick={() => onSelectKra(k.kra_key)}
                      hideMetricLabels
                      expandable
                      expanded={isOpen}
                      ariaControls={panelId}
                      metrics={[
                        { label: 'KPI count', value: k.kpi_count },
                        { label: 'Employee impact', value: employees },
                      ]}
                    />
                    {isOpen && (
                      <div id={panelId} className="border-t bg-muted/30 py-2 pl-3 pr-2 sm:pl-8">
                        <div className="overflow-hidden rounded-md border bg-background">
                          <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-1.5">
                            <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              KPIs · {k.kpi_count}
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
                          {k.kpis.length === 0 ? (
                            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                              No KPIs mapped under this KRA for the loaded scope.
                            </p>
                          ) : (
                            <div className="max-h-[420px] divide-y overflow-y-auto">
                              {k.kpis.map((kpi, ki) => (
                                <KpiRow
                                  key={kpi.kpi_key}
                                  kpi={kpi}
                                  index={ki + 1}
                                  lookalikeCount={lookalikes.get(kpi.kpi_key)}
                                  onFixTextSplit={onFixTextSplit}
                                  onOpen={(variantKey) =>
                                    onSelectKpi(category.category_id, k.kra_name, kpi, variantKey)
                                  }
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              }}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}