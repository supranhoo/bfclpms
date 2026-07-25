import { type ReactNode, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
  SheetClose,
} from '@/components/ui/sheet';
import { SlidersHorizontal } from 'lucide-react';

/**
 * TabletFilterSheet — collapses a filter cluster into a single 44pt trigger
 * button + right-side Sheet. Frees vertical space on tablet toolbars.
 * ADR-170 §4.1.
 */
export interface TabletFilterSheetProps {
  /** Number of active filters (drives count badge). */
  activeCount?: number;
  triggerLabel?: string;
  title?: string;
  /** The full filter form; rendered inside the Sheet body. */
  children: ReactNode;
  onApply?: () => void;
  onClear?: () => void;
  applyLabel?: string;
  clearLabel?: string;
}

export function TabletFilterSheet({
  activeCount = 0,
  triggerLabel = 'Filters',
  title = 'Filters',
  children,
  onApply,
  onClear,
  applyLabel = 'Apply',
  clearLabel = 'Clear all',
}: TabletFilterSheetProps) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="min-h-11 gap-2"
          aria-label={`${triggerLabel} (${activeCount} active)`}
        >
          <SlidersHorizontal className="h-4 w-4" />
          <span>{triggerLabel}</span>
          {activeCount > 0 && (
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[11px]">
              {activeCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto py-4 space-y-4">{children}</div>
        <SheetFooter className="flex-row justify-between gap-2 border-t pt-3">
          <Button
            variant="ghost"
            className="min-h-11"
            onClick={() => {
              onClear?.();
            }}
          >
            {clearLabel}
          </Button>
          <SheetClose asChild>
            <Button
              className="min-h-11"
              onClick={() => onApply?.()}
            >
              {applyLabel}
            </Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}