import { useState, useMemo } from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface ManagerOption {
  id: string;
  full_name: string | null;
  employee_code: string | null;
}

interface ManagerComboboxProps {
  value: string;
  onValueChange: (value: string) => void;
  profiles: ManagerOption[];
  excludeId?: string;
  placeholder?: string;
  showNone?: boolean;
  noneLabel?: string;
}

export function formatManagerLabel(name: string | null, code: string | null): string {
  const display = name || 'Unknown';
  return code ? `${display} (${code})` : display;
}

export function ManagerCombobox({
  value,
  onValueChange,
  profiles,
  excludeId,
  placeholder = 'Search manager...',
  showNone = true,
  noneLabel = 'None',
}: ManagerComboboxProps) {
  const [open, setOpen] = useState(false);

  const options = useMemo(() => {
    return profiles
      .filter(p => p.id !== excludeId)
      .map(p => ({
        value: p.id,
        label: formatManagerLabel(p.full_name, p.employee_code),
      }));
  }, [profiles, excludeId]);

  const selectedLabel = useMemo(() => {
    if (!value || value === 'none') return showNone ? noneLabel : '';
    return options.find(o => o.value === value)?.label || '';
  }, [value, options, showNone, noneLabel]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal h-10"
        >
          <span className="truncate">
            {selectedLabel || <span className="text-muted-foreground">{placeholder}</span>}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder={placeholder} />
          <CommandList>
            <CommandEmpty>No manager found.</CommandEmpty>
            <CommandGroup>
              {showNone && (
                <CommandItem
                  value="none"
                  onSelect={() => {
                    onValueChange('none');
                    setOpen(false);
                  }}
                >
                  <Check className={cn('mr-2 h-4 w-4', value === 'none' ? 'opacity-100' : 'opacity-0')} />
                  {noneLabel}
                </CommandItem>
              )}
              {options.map(option => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  onSelect={() => {
                    onValueChange(option.value);
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
  );
}
