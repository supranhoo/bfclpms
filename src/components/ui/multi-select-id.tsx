import { useState, useMemo } from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';

/**
 * MultiSelectId
 * -------------
 * Like {@link MultiSelectFilter} but values are opaque IDs while options
 * expose a separate display label. Used by Safety filters where the WHERE
 * clause must be on `id` but the user sees a friendly name.
 */
export interface MultiSelectIdOption { id: string; label: string }

interface Props {
  options: MultiSelectIdOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  className?: string;
  searchPlaceholder?: string;
}

export function MultiSelectId({
  options, value, onChange, placeholder = 'All', className, searchPlaceholder = 'Search...',
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search) return options;
    const q = search.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, search]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((o) => value.includes(o.id));
  const labelById = useMemo(() => new Map(options.map((o) => [o.id, o.label])), [options]);

  const toggle = (id: string) => {
    if (value.includes(id)) onChange(value.filter((v) => v !== id));
    else onChange([...value, id]);
  };
  const toggleAllFiltered = () => {
    const ids = filtered.map((o) => o.id);
    if (allFilteredSelected) onChange(value.filter((v) => !ids.includes(v)));
    else onChange(Array.from(new Set([...value, ...ids])));
  };
  const clear = (e?: React.MouseEvent) => { e?.stopPropagation(); onChange([]); };

  const display =
    value.length === 0
      ? placeholder
      : value.length === 1
      ? labelById.get(value[0]) ?? '1 selected'
      : `${value.length} selected`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className={cn('justify-between font-normal', className)}>
          <span className="truncate text-left flex-1">{display}</span>
          <div className="flex items-center gap-1 shrink-0">
            {value.length > 0 && (
              <Badge variant="secondary" className="h-4 px-1 text-[10px]">{value.length}</Badge>
            )}
            {value.length > 0 ? (
              <X className="h-3 w-3 opacity-60 hover:opacity-100" onClick={clear} />
            ) : (
              <ChevronsUpDown className="h-3 w-3 opacity-50" />
            )}
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder={searchPlaceholder} value={search} onValueChange={setSearch} className="h-9" />
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>
            {filtered.length > 0 && (
              <>
                <CommandGroup>
                  <CommandItem onSelect={toggleAllFiltered} className="cursor-pointer">
                    <Checkbox checked={allFilteredSelected} className="mr-2" />
                    <span className="font-medium">
                      {allFilteredSelected ? 'Deselect All' : 'Select All'}
                      {search && ` (${filtered.length} match)`}
                    </span>
                  </CommandItem>
                </CommandGroup>
                <CommandSeparator />
              </>
            )}
            <CommandGroup className="max-h-[240px] overflow-y-auto">
              {filtered.map((opt) => {
                const checked = value.includes(opt.id);
                return (
                  <CommandItem key={opt.id} onSelect={() => toggle(opt.id)} className="cursor-pointer">
                    <Checkbox checked={checked} className="mr-2" />
                    <span className="flex-1 truncate">{opt.label}</span>
                    {checked && <Check className="h-3 w-3 opacity-60" />}
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