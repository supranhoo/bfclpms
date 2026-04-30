import { useState } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface Props {
  /** YYYY-MM-01 string or null */
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
  className?: string;
}

/** Always returns YYYY-MM-01 from a Date. */
function toFirstOfMonth(year: number, monthIndex: number): string {
  const m = String(monthIndex + 1).padStart(2, '0');
  return `${year}-${m}-01`;
}

function parse(value: string | null): Date | undefined {
  if (!value) return undefined;
  const m = /^(\d{4})-(\d{2})/.exec(value);
  if (!m) return undefined;
  return new Date(Number(m[1]), Number(m[2]) - 1, 1);
}

/**
 * Month-only picker (snaps any selected day to day=1). Built on shadcn Calendar.
 * Shows "MMM yyyy" and uses the dropdown caption for fast year navigation.
 */
export function MonthPicker({ value, onChange, placeholder = 'Pick a month', disabled, allowClear = true, className }: Props) {
  const [open, setOpen] = useState(false);
  const date = parse(value);
  const today = new Date();
  const initialYear = date ? date.getFullYear() : today.getFullYear();
  const [viewYear, setViewYear] = useState<number>(initialYear);

  const minYear = today.getFullYear() - 2;
  const maxYear = today.getFullYear() + 5;
  const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn('w-full justify-start font-normal gap-2', !date && 'text-muted-foreground', className)}
        >
          <CalendarIcon className="h-4 w-4 opacity-60" />
          <span className="flex-1 text-left">{date ? format(date, 'MMM yyyy') : placeholder}</span>
          {allowClear && date && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Clear month"
              onClick={(e) => { e.stopPropagation(); onChange(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onChange(null); } }}
              className="rounded p-0.5 hover:bg-muted"
            >
              <X className="h-3.5 w-3.5 opacity-60" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3 pointer-events-auto" align="start">
        <div className="w-[260px] space-y-3">
          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={viewYear <= minYear}
              onClick={() => setViewYear((y) => Math.max(minYear, y - 1))}
              aria-label="Previous year"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-sm font-semibold">{viewYear}</div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={viewYear >= maxYear}
              onClick={() => setViewYear((y) => Math.min(maxYear, y + 1))}
              aria-label="Next year"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {MONTHS_SHORT.map((label, idx) => {
              const isSelected =
                !!date && date.getFullYear() === viewYear && date.getMonth() === idx;
              const isCurrent =
                today.getFullYear() === viewYear && today.getMonth() === idx;
              return (
                <Button
                  key={label}
                  type="button"
                  variant={isSelected ? 'default' : 'outline'}
                  size="sm"
                  className={cn(
                    'h-9 text-xs font-medium',
                    !isSelected && isCurrent && 'border-primary text-primary',
                  )}
                  onClick={() => {
                    onChange(toFirstOfMonth(viewYear, idx));
                    setOpen(false);
                  }}
                >
                  {label}
                </Button>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}