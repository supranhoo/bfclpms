/**
 * ADR-259 — Category folders → KRA list → KPI list drilldown.
 * Pure presentation: it receives an already-loaded tree and reports selection.
 *
 * ADR-264 — the KRA and KPI lists are virtualized, so a category holding
 * thousands of rows renders (and scrolls) without dropping any of them.
 */
import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronRight, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ConsoleMetricRow } from './ConsoleMetricRow';
import type { BuConsoleCategoryNode, BuConsoleKraNode } from '@/hooks/useBuConsole';

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
  onSelectKpi: (categoryId: string, kraName: string, kpiName: string) => void;
}

export function BuConsoleTree({
  categories,
  selectedCategoryId,
  selectedKraKey,
  onSelectCategory,
  onSelectKra,
  onSelectKpi,
}: Props) {
  const category = categories.find(c => c.category_id === selectedCategoryId) ?? null;
  const kra: BuConsoleKraNode | null =
    category?.kras.find(k => k.kra_key === selectedKraKey) ?? null;

  return (
    <div className="space-y-3">
      {/* Category tab strip — one scrollable row instead of a wrapped chip grid */}
      {categories.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No KPIs found for this scope and period.
        </p>
      ) : (
        <div
          role="tablist"
          aria-label="KPI categories"
          className="-mx-1 flex gap-1 overflow-x-auto border-b px-1 pb-px [scrollbar-width:thin]"
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
                  'flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm transition-colors',
                  active
                    ? 'border-primary font-semibold text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {c.category_name}
                <Badge variant="secondary" className="h-5 px-1.5 text-[11px]">
                  {c.kpi_count}
                </Badge>
              </button>
            );
          })}
        </div>
      )}

      {/* KRA list */}
      {category && (
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {category.category_name} · KRAs
              </p>
              <p className="text-xs text-muted-foreground">
                {category.kra_count} KRAs · {category.kpi_count} KPIs
              </p>
            </div>
            <VirtualRows
              items={category.kras}
              estimateSize={56}
              maxHeightClass="max-h-[420px]"
              renderRow={(k, i) => {
                const employees = k.kpis.reduce((n, kpi) => n + (kpi.employee_count ?? 0), 0);
                return (
                  <ConsoleMetricRow
                    key={k.kra_key}
                    index={i + 1}
                    title={k.kra_name}
                    subtitle={`${k.kpi_count} mapped KPI${k.kpi_count === 1 ? '' : 's'}`}
                    selected={k.kra_key === selectedKraKey}
                    onClick={() => onSelectKra(k.kra_key)}
                    metrics={[
                      { label: 'KPI count', value: k.kpi_count },
                      { label: 'Employee impact', value: employees },
                    ]}
                  />
                );
              }}
            />
          </CardContent>
        </Card>
      )}

      {/* KPI list */}
      {category && kra && (
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
              <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {kra.kra_name} · KPIs
              </p>
              <p className="shrink-0 text-xs text-muted-foreground">{kra.kpi_count} KPIs</p>
            </div>
            <VirtualRows
              items={kra.kpis}
              estimateSize={60}
              maxHeightClass="max-h-[520px]"
              renderRow={(kpi, i) => (
                <ConsoleMetricRow
                  key={kpi.kpi_key}
                  index={i + 1}
                  title={kpi.kpi_name}
                  subtitle={
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {kpi.employee_count} employee{kpi.employee_count === 1 ? '' : 's'} mapped
                      {kpi.is_org_level && (
                        <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                          Org-level
                        </Badge>
                      )}
                    </span>
                  }
                  onClick={() => onSelectKpi(category.category_id, kra.kra_name, kpi.kpi_name)}
                  trailing={
                    <span className="flex items-center gap-1 text-xs font-medium text-primary">
                      Open <ChevronRight className="h-4 w-4" />
                    </span>
                  }
                />
              )}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}