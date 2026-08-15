/**
 * ADR-268 — compact scope toolbar for the BU Performance Console.
 *
 * Replaces the full-height Scope card: one sticky row on desktop, and a single
 * "Filters (n)" sheet trigger below `md`. Filter state and the cascading rules
 * (ADR-229) stay owned by the page — this component is layout only.
 */
import { useState, type ReactNode } from 'react';
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
  hint?: ReactNode;
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
  hint,
}: ScopeToolbarProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const activeCount = filters.reduce((n, f) => n + (f.values.length > 0 ? 1 : 0), 0);

  return (
    <div className="sticky top-0 z-30 -mx-4 border-b bg-background/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <ReviewPeriodSelector
          selectedPeriod={period}
          selectedYear={year}
          onPeriodChange={onPeriodChange}
          onYearChange={onYearChange}
        />

        {/* Desktop: inline filters */}
        <div className="hidden flex-1 flex-wrap items-center gap-2 md:flex">
          {filters.map(f => (
            <div key={f.key} className="min-w-[150px] max-w-[220px] flex-1">
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
          <Button className="min-h-11" onClick={onApply} disabled={isBusy}>
            Load console
          </Button>
          {hasScope && onRefresh && (
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
          )}
        </div>
      </div>

      {hint && <p className="pt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}