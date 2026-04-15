import { useState, useMemo, useCallback } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

export interface ComboboxOption {
  value: string;
  label: string;
}

interface OrgFilterComboboxProps {
  /** Single-select value */
  value?: string;
  onValueChange?: (value: string) => void;
  /** Multi-select values */
  multiSelect?: boolean;
  values?: string[];
  onValuesChange?: (values: string[]) => void;
  options: ComboboxOption[];
  placeholder?: string;
  label?: string;
  emptyMessage?: string;
  disabled?: boolean;
}

export function OrgFilterCombobox({
  value,
  onValueChange,
  multiSelect = false,
  values = [],
  onValuesChange,
  options,
  placeholder = 'Search...',
  label,
  emptyMessage = 'No results found.',
  disabled = false,
}: OrgFilterComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Filtered options based on search
  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter(o => o.label.toLowerCase().includes(q));
  }, [options, search]);

  // --- Single-select mode ---
  if (!multiSelect) {
    const selectedLabel = options.find(o => o.value === value)?.label || '';

    return (
      <div className="space-y-1.5">
        {label && <label className="text-sm font-medium">{label}</label>}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="w-full justify-between font-normal h-9 text-sm"
              disabled={disabled}
            >
              <span className="truncate">
                {selectedLabel || <span className="text-muted-foreground">{placeholder}</span>}
              </span>
              <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
            <Command>
              <CommandInput placeholder={placeholder} />
              <CommandList>
                <CommandEmpty>{emptyMessage}</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    value="__clear__"
                    onSelect={() => {
                      onValueChange?.('');
                      setOpen(false);
                    }}
                  >
                    <Check className={cn('mr-2 h-4 w-4', !value ? 'opacity-100' : 'opacity-0')} />
                    <span className="text-muted-foreground">— None —</span>
                  </CommandItem>
                  {options.map(option => (
                    <CommandItem
                      key={option.value}
                      value={option.label}
                      onSelect={() => {
                        onValueChange?.(option.value);
                        setOpen(false);
                      }}
                    >
                      <Check className={cn('mr-2 h-4 w-4', value === option.value ? 'opacity-100' : 'opacity-0')} />
                      {option.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    );
  }

  // --- Multi-select mode ---
  const selectedSet = new Set(values);
  const allFilteredSelected = filteredOptions.length > 0 && filteredOptions.every(o => selectedSet.has(o.value));

  const triggerLabel = values.length === 0
    ? ''
    : values.length === 1
      ? options.find(o => o.value === values[0])?.label || '1 selected'
      : `${values.length} selected`;

  const toggleItem = (val: string) => {
    const next = selectedSet.has(val)
      ? values.filter(v => v !== val)
      : [...values, val];
    onValuesChange?.(next);
  };

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      // Deselect all filtered
      const filteredSet = new Set(filteredOptions.map(o => o.value));
      onValuesChange?.(values.filter(v => !filteredSet.has(v)));
    } else {
      // Select all filtered (merge with existing)
      const merged = new Set(values);
      filteredOptions.forEach(o => merged.add(o.value));
      onValuesChange?.([...merged]);
    }
  };

  const clearAll = () => {
    onValuesChange?.([]);
  };

  return (
    <div className="space-y-1.5">
      {label && <label className="text-sm font-medium">{label}</label>}
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch(''); }}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal h-9 text-sm"
            disabled={disabled}
          >
            <span className="truncate">
              {triggerLabel || <span className="text-muted-foreground">{placeholder}</span>}
            </span>
            <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder={placeholder} value={search} onValueChange={setSearch} />
            <CommandList>
              <CommandEmpty>{emptyMessage}</CommandEmpty>
              <CommandGroup>
                {/* Clear all */}
                <CommandItem value="__clear__" onSelect={clearAll}>
                  <Check className={cn('mr-2 h-4 w-4', values.length === 0 ? 'opacity-100' : 'opacity-0')} />
                  <span className="text-muted-foreground">— None —</span>
                </CommandItem>
                {/* Select All */}
                <CommandItem value="__select_all__" onSelect={toggleSelectAll}>
                  <Checkbox
                    checked={allFilteredSelected}
                    className="mr-2 h-4 w-4 pointer-events-none"
                    tabIndex={-1}
                  />
                  <span className="font-medium">Select All ({filteredOptions.length})</span>
                </CommandItem>
                {/* Individual options */}
                {filteredOptions.map(option => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    onSelect={() => toggleItem(option.value)}
                  >
                    <Checkbox
                      checked={selectedSet.has(option.value)}
                      className="mr-2 h-4 w-4 pointer-events-none"
                      tabIndex={-1}
                    />
                    {option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
