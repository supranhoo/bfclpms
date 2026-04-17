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

interface MultiSelectFilterProps {
  options: string[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  label?: string;
  className?: string;
  searchPlaceholder?: string;
}

export function MultiSelectFilter({
  options,
  value,
  onChange,
  placeholder = 'All',
  label,
  className,
  searchPlaceholder = 'Search...',
}: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search) return options;
    const q = search.toLowerCase();
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, search]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((o) => value.includes(o));

  const toggle = (opt: string) => {
    if (value.includes(opt)) onChange(value.filter((v) => v !== opt));
    else onChange([...value, opt]);
  };

  const toggleAllFiltered = () => {
    if (allFilteredSelected) {
      onChange(value.filter((v) => !filtered.includes(v)));
    } else {
      const merged = Array.from(new Set([...value, ...filtered]));
      onChange(merged);
    }
  };

  const clear = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    onChange([]);
  };

  const display =
    value.length === 0
      ? placeholder
      : value.length === 1
      ? value[0]
      : `${value.length} selected`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('justify-between font-normal', className)}
        >
          <span className="truncate text-left flex-1">
            {label && value.length === 0 && (
              <span className="text-muted-foreground">{label}</span>
            )}
            {(value.length > 0 || !label) && <span>{display}</span>}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            {value.length > 0 && (
              <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                {value.length}
              </Badge>
            )}
            {value.length > 0 ? (
              <X
                className="h-3 w-3 opacity-60 hover:opacity-100"
                onClick={clear}
              />
            ) : (
              <ChevronsUpDown className="h-3 w-3 opacity-50" />
            )}
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={searchPlaceholder}
            value={search}
            onValueChange={setSearch}
            className="h-9"
          />
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
                const checked = value.includes(opt);
                return (
                  <CommandItem
                    key={opt}
                    onSelect={() => toggle(opt)}
                    className="cursor-pointer"
                  >
                    <Checkbox checked={checked} className="mr-2" />
                    <span className="flex-1 truncate">{opt}</span>
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
