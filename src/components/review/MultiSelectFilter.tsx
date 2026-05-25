import { useMemo, useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';

export interface MultiSelectOption {
  value: string;
  label: string;
}

export interface MultiSelectFilterProps {
  icon?: React.ReactNode;
  label: string;
  options: MultiSelectOption[];
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  width?: number;
  disabled?: boolean;
  title?: string;
  emptyText?: string;
}

/**
 * Compact multi-select used in the Bulk Review filter bar.
 * - Trigger matches the height/typography of the surrounding shadcn Selects.
 * - Empty `values` array = "All <label>"  (broadest scope).
 * - Searchable list with Select-all / Clear shortcuts.
 */
export function MultiSelectFilter({
  icon, label, options, values, onChange,
  placeholder, width = 170, disabled, title, emptyText,
}: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false);
  const selectedSet = useMemo(() => new Set(values), [values]);

  const toggle = (v: string) => {
    const next = new Set(selectedSet);
    if (next.has(v)) next.delete(v); else next.add(v);
    onChange(Array.from(next));
  };

  const triggerText = values.length === 0
    ? (placeholder ?? `All ${label}`)
    : values.length === 1
      ? (options.find(o => o.value === values[0])?.label ?? '1 selected')
      : `${label} · ${values.length}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          title={title}
          className={cn(
            'h-8 shrink-0 text-xs justify-between gap-1.5 font-normal',
            values.length > 0 && 'border-primary/50 bg-primary/5',
          )}
          style={{ width }}
          aria-label={label}
        >
          <span className="flex items-center gap-1.5 min-w-0 truncate">
            {icon}
            <span className="truncate">{triggerText}</span>
          </span>
          <span className="flex items-center gap-1 shrink-0">
            {values.length > 1 && (
              <Badge variant="secondary" className="h-4 px-1 text-[9px] tabular-nums">
                {values.length}
              </Badge>
            )}
            <ChevronDown className="h-3 w-3 opacity-60" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[260px]" align="start">
        <Command>
          <CommandInput placeholder={`Search ${label.toLowerCase()}…`} className="h-9" />
          <div className="flex items-center justify-between px-2 py-1 border-b border-border/60 text-[10px] uppercase tracking-widest text-muted-foreground">
            <span>{values.length} of {options.length} selected</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="hover:text-foreground"
                onClick={() => onChange(options.map(o => o.value))}
                disabled={options.length === 0}
              >
                Select all
              </button>
              <span className="opacity-40">·</span>
              <button
                type="button"
                className="hover:text-foreground inline-flex items-center gap-0.5"
                onClick={() => onChange([])}
              >
                <X className="h-2.5 w-2.5" /> Clear
              </button>
            </div>
          </div>
          <CommandList className="max-h-64">
            <CommandEmpty>{emptyText ?? 'No options'}</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => {
                const checked = selectedSet.has(opt.value);
                return (
                  <CommandItem
                    key={opt.value}
                    value={`${opt.label} ${opt.value}`}
                    onSelect={() => toggle(opt.value)}
                    className="text-xs"
                  >
                    <div className={cn(
                      'mr-2 flex h-3.5 w-3.5 items-center justify-center rounded-sm border',
                      checked ? 'bg-primary text-primary-foreground border-primary' : 'border-input',
                    )}>
                      {checked && <Check className="h-3 w-3" />}
                    </div>
                    <span className="truncate">{opt.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}