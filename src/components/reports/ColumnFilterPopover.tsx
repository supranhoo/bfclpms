import { useMemo, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Filter, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Excel-style per-column filter. Renders a funnel icon in the header; clicking
 * opens a popover with a search box and a checkbox list of distinct values.
 *
 * - `selected` = null OR empty set  ⇒ column is unfiltered (all values pass).
 * - `selected` = non-empty set      ⇒ only rows whose value ∈ set pass.
 *
 * The parent owns the state so filters can compose across columns and be
 * cleared globally.
 */
export interface ColumnFilterPopoverProps {
  /** Distinct values available for this column (already computed by parent). */
  values: string[];
  /** Currently selected set (null / empty ⇒ no filter applied). */
  selected: Set<string> | null;
  /** Called with the new set (or null to clear). */
  onChange: (next: Set<string> | null) => void;
  /** Optional label shown at the top of the popover ("Filter Status"). */
  label?: string;
  /** Optional renderer to prettify a raw value in the checkbox list. */
  renderValue?: (v: string) => React.ReactNode;
}

export function ColumnFilterPopover({
  values,
  selected,
  onChange,
  label,
  renderValue,
}: ColumnFilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const isActive = !!selected && selected.size > 0;

  const filtered = useMemo(() => {
    if (!search.trim()) return values;
    const s = search.toLowerCase();
    return values.filter(v => v.toLowerCase().includes(s));
  }, [values, search]);

  const allChecked = filtered.length > 0 && filtered.every(v => selected?.has(v));
  const someChecked = filtered.some(v => selected?.has(v));

  const toggle = (value: string, checked: boolean) => {
    const next = new Set(selected ?? []);
    if (checked) next.add(value);
    else next.delete(value);
    onChange(next.size ? next : null);
  };

  const toggleAll = (checked: boolean) => {
    if (!checked) {
      // Remove all currently-visible values from the set.
      const next = new Set(selected ?? []);
      filtered.forEach(v => next.delete(v));
      onChange(next.size ? next : null);
    } else {
      const next = new Set(selected ?? []);
      filtered.forEach(v => next.add(v));
      onChange(next);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={e => e.stopPropagation()}
          className={cn(
            'inline-flex items-center justify-center h-5 w-5 rounded hover:bg-muted-foreground/10 transition-colors ml-1',
            isActive && 'text-primary bg-primary/10',
          )}
          aria-label={label ? `Filter ${label}` : 'Filter column'}
        >
          <Filter className={cn('h-3 w-3', isActive && 'fill-current')} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[240px] p-2"
        onClick={e => e.stopPropagation()}
      >
        <div className="space-y-2">
          {label && (
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">{label}</span>
              {isActive && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px] gap-1 px-1.5"
                  onClick={() => onChange(null)}
                >
                  <X className="h-3 w-3" /> Clear
                </Button>
              )}
            </div>
          )}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              placeholder="Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-7 h-7 text-xs"
            />
          </div>
          <label className="flex items-center gap-2 py-1 px-1 rounded hover:bg-muted/50 cursor-pointer border-b">
            <Checkbox
              checked={allChecked ? true : someChecked ? 'indeterminate' : false}
              onCheckedChange={c => toggleAll(!!c)}
            />
            <span className="text-xs font-medium">
              (Select all{search ? ' matching' : ''})
            </span>
          </label>
          <div className="max-h-[220px] overflow-y-auto space-y-0.5">
            {filtered.length === 0 ? (
              <div className="text-[11px] text-muted-foreground px-1 py-3 text-center">
                No values
              </div>
            ) : (
              filtered.map(v => (
                <label
                  key={v}
                  className="flex items-center gap-2 py-1 px-1 rounded hover:bg-muted/50 cursor-pointer"
                >
                  <Checkbox
                    checked={selected?.has(v) ?? false}
                    onCheckedChange={c => toggle(v, !!c)}
                  />
                  <span className="text-xs truncate flex-1" title={v}>
                    {renderValue ? renderValue(v) : v || '(blank)'}
                  </span>
                </label>
              ))
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}