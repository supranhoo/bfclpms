import { useState } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
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
function toFirstOfMonth(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
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
      <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => {
            if (d) {
              onChange(toFirstOfMonth(d));
              setOpen(false);
            }
          }}
          captionLayout="dropdown-buttons"
          fromYear={new Date().getFullYear() - 2}
          toYear={new Date().getFullYear() + 5}
          initialFocus
          className={cn('p-3 pointer-events-auto')}
        />
      </PopoverContent>
    </Popover>
  );
}