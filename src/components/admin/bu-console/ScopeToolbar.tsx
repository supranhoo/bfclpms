/**
 * ADR-268 — compact scope toolbar for the BU Performance Console.
 *
 * Replaces the full-height Scope card: one sticky row on desktop, and a single
 * "Filters (n)" sheet trigger below `md`. Filter state and the cascading rules
 * (ADR-229) stay owned by the page — this component is layout only.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ReviewPeriodSelector } from '@/components/ui/ReviewPeriodSelector';
import { OrgFilterCombobox, type ComboboxOption } from '@/components/admin/OrgFilterCombobox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { RefreshCw, SlidersHorizontal } from 'lucide-react';

export interface ScopeFilterConfig {
  key: string;
  label: string;
  placeholder: string;
  values: string[];
  onValuesChange: (values: string[]) => void;
  options: ComboboxOption[];
}

interface ScopeToolbarProps {
  period: string;
  year: number;
  onPeriodChange: (period: string) => void;
  onYearChange: (year: number) => void;
  filters: ScopeFilterConfig[];
  onApply: () => void;
  onRefresh?: () => void;
  isBusy?: boolean;
  hasScope?: boolean;
  /** ADR-271 — filters changed since the loaded scope; results below are stale. */
  isDirty?: boolean;
  hint?: ReactNode;
  /** ADR-283 — one-line summary shown when the bar collapses on scroll. */
  summary?: string;
  /** ADR-336 — free-text search over the loaded tree (category / KRA / KPI). */
  search?: string;
  onSearchChange?: (value: string) => void;
  /** Result line rendered under the bar while a search is active. */
  searchSummary?: ReactNode;
}

export function ScopeToolbar({
  period,
  year,
  onPeriodChange,
  onYearChange,
  filters,
  onApply,
  onRefresh,
  isBusy,
  hasScope,
  isDirty,
  hint,
  summary,
  search,
  onSearchChange,
  searchSummary,
}: ScopeToolbarProps) {

  const [sheetOpen, setSheetOpen] = useState(false);
  const activeCount = filters.reduce((n, f) => n + (f.values.length > 0 ? 1 : 0), 0);

  /**
   * ADR-283 — once the user scrolls into the data the sticky bar shrinks to a
   * summary chip. It never collapses while the filters are dirty: the "Apply
   * filters" call to action must stay visible.
   */
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [forceOpen, setForceOpen] = useState(false);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setScrolled(!entry.isIntersecting), {
      threshold: 1,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const collapsed = scrolled && !!hasScope && !isDirty && !forceOpen;

  if (collapsed) {
    return (
      <>
        <div ref={sentinelRef} aria-hidden className="h-px w-full" />
        <div className="sticky top-0 z-30 flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5 shadow-sm">
          <SlidersHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {summary ?? `${period} ${year}`}
            {activeCount > 0 && ` · ${activeCount} filter${activeCount === 1 ? '' : 's'}`}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="min-h-11 shrink-0"
            onClick={() => setForceOpen(true)}
          >
            Change
          </Button>
          {onRefresh && (
            <Button
              variant="outline"
              size="icon"
              className="min-h-11 min-w-11 shrink-0"
              onClick={onRefresh}
              disabled={isBusy}
              aria-label="Refresh console data"
            >
              <RefreshCw className={`h-4 w-4 ${isBusy ? 'animate-spin' : ''}`} />
            </Button>
          )}
        </div>
      </>
    );
  }

  return (
    <>
    <div ref={sentinelRef} aria-hidden className="h-px w-full" />
    <div className="sticky top-0 z-30 rounded-lg border bg-card px-3 py-2.5 shadow-sm sm:px-4">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <ReviewPeriodSelector
            selectedPeriod={period}
            selectedYear={year}
            onPeriodChange={onPeriodChange}
            onYearChange={onYearChange}
          />
        </div>

        {/* ADR-336 — search the loaded tree: category, KRA or KPI. */}
        {onSearchChange && (
          <div className="relative w-full min-w-[180px] sm:w-auto sm:flex-1 sm:max-w-[280px]">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              value={search ?? ''}
              onChange={e => onSearchChange(e.target.value)}
              disabled={!hasScope}
              placeholder="Search KRA, KPI or employee"
              aria-label="Search categories, KRAs, KPIs and employees in the loaded scope"
              className="h-10 pl-8"
            />
          </div>
        )}



        {/* Desktop: inline filters */}
        <div className="hidden flex-1 flex-wrap items-center gap-2 md:flex">
          {filters.map(f => (
            <div key={f.key} className="min-w-[150px] max-w-[220px] flex-1" title={f.label}>
              <OrgFilterCombobox
                multiSelect
                values={f.values}
                onValuesChange={f.onValuesChange}
                options={f.options}
                placeholder={f.placeholder}
              />
            </div>
          ))}
        </div>

        {/* Mobile / tablet: sheet */}
        <div className="md:hidden">
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                className="min-h-11 gap-2"
                aria-label={`Filters (${activeCount} active)`}
              >
                <SlidersHorizontal className="h-4 w-4" />
                Filters
                {activeCount > 0 && (
                  <Badge variant="secondary" className="h-5 px-1.5 text-[11px]">
                    {activeCount}
                  </Badge>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
              <SheetHeader>
                <SheetTitle>Scope filters</SheetTitle>
              </SheetHeader>
              <div className="flex-1 space-y-4 overflow-y-auto py-4">
                {filters.map(f => (
                  <OrgFilterCombobox
                    key={f.key}
                    multiSelect
                    label={f.label}
                    values={f.values}
                    onValuesChange={f.onValuesChange}
                    options={f.options}
                    placeholder={f.placeholder}
                  />
                ))}
              </div>
              <SheetFooter className="flex-row justify-between gap-2 border-t pt-3">
                <Button
                  variant="ghost"
                  className="min-h-11"
                  onClick={() => filters.forEach(f => f.onValuesChange([]))}
                >
                  Clear all
                </Button>
                <SheetClose asChild>
                  <Button className="min-h-11" onClick={onApply}>
                    Apply
                  </Button>
                </SheetClose>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {isDirty && hasScope && (
            <span
              role="status"
              className="hidden rounded-md bg-warning/10 px-2 py-1 text-xs font-medium text-warning sm:inline"
            >
              Filters changed — apply to refresh
            </span>
          )}
          <Button
            className="min-h-11"
            onClick={onApply}
            disabled={isBusy}
            variant={isDirty ? 'default' : hasScope ? 'outline' : 'default'}
          >
            {isDirty && hasScope ? 'Apply filters' : 'Load console'}
          </Button>
          {hasScope && onRefresh && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="min-h-11 min-w-11"
                    onClick={onRefresh}
                    disabled={isBusy}
                    aria-label="Refresh console data"
                  >
                    <RefreshCw className={`h-4 w-4 ${isBusy ? 'animate-spin' : ''}`} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Refresh console data</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      {isDirty && hasScope && (
        <p className="pt-1.5 text-xs font-medium text-warning sm:hidden" role="status">
          Filters changed — apply to refresh the results below.
        </p>
      )}
      {hint && <p className="pt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
    </>
  );
}