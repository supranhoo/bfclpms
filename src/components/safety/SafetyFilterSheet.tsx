import { type FormEvent, type ReactNode, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter,
} from '@/components/ui/sheet';
import { Search, RotateCcw, Loader2, SlidersHorizontal } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

/**
 * SafetyFilterSheet
 * -----------------
 * Mobile-first variant of SafetyFilterBar. On `md+` it renders the same
 * inline form as SafetyFilterBar; on mobile it collapses into a single
 * "Filters (n)" button that opens a bottom Sheet containing the inputs.
 *
 * `activeCount` is the number of non-default filters currently applied
 * (parent computes this — usually one increment per filter !== "all").
 */
export interface SafetyFilterSheetProps {
  title?: string;
  description?: string;
  onSubmit: () => void;
  onReset?: () => void;
  isSubmitting?: boolean;
  submitLabel?: string;
  /** Count of active (non-default) filters — drives the badge. */
  activeCount?: number;
  children: ReactNode;
}

export function SafetyFilterSheet({
  title = 'Filters',
  description = 'Apply filters and tap Search to load data.',
  onSubmit,
  onReset,
  isSubmitting = false,
  submitLabel = 'Search',
  activeCount = 0,
  children,
}: SafetyFilterSheetProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSubmit();
    if (isMobile) setOpen(false);
  };

  if (!isMobile) {
    // Desktop: identical to SafetyFilterBar layout.
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {children}
            </div>
            <div className="flex items-center justify-end gap-2 pt-1 border-t">
              {onReset && (
                <Button type="button" variant="outline" size="sm" onClick={onReset}>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reset
                </Button>
              )}
              <Button type="submit" size="sm" disabled={isSubmitting}>
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Search className="h-4 w-4 mr-2" />
                )}
                {submitLabel}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    );
  }

  // Mobile: trigger button + Sheet
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <div className="flex items-center gap-2">
        <SheetTrigger asChild>
          <Button variant="outline" size="sm" className="h-10 flex-1">
            <SlidersHorizontal className="h-4 w-4 mr-2" />
            {title}
            {activeCount > 0 && (
              <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">
                {activeCount}
              </Badge>
            )}
          </Button>
        </SheetTrigger>
        <Button
          size="sm"
          className="h-10"
          onClick={onSubmit}
          disabled={isSubmitting}
          aria-label="Search now"
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
        </Button>
      </div>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle>{title}</SheetTitle>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </SheetHeader>
        <form onSubmit={handleSubmit} className="space-y-3 mt-4">
          <div className="grid grid-cols-1 gap-3">{children}</div>
          <SheetFooter className="flex-row gap-2 sm:gap-2 sm:justify-end pt-2">
            {onReset && (
              <Button
                type="button"
                variant="outline"
                className="flex-1 h-11"
                onClick={() => { onReset(); setOpen(false); }}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset
              </Button>
            )}
            <Button type="submit" className="flex-1 h-11" disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Search className="h-4 w-4 mr-2" />
              )}
              {submitLabel}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}