import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { useProfiles } from '@/hooks/useOrganization';

export interface EmployeeOption {
  id: string;
  full_name: string | null;
  employee_code: string | null;
  department_name?: string | null;
  designation_name?: string | null;
  email?: string | null;
}

interface Props {
  value: string | null;
  onChange: (id: string | null, employee: EmployeeOption | null) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Render as a full-width filter trigger (with "Clear" affordance). */
  asFilter?: boolean;
  className?: string;
}

/**
 * Searchable employee picker — searches by full_name OR employee_code OR email.
 * Filters out inactive employees (useProfiles already does this).
 * Used by both the AddReviewNoteSheet and the Hub Employee filter.
 */
export function EmployeePickerCombobox({ value, onChange, placeholder = 'Search name or employee code…', disabled, asFilter, className }: Props) {
  const [open, setOpen] = useState(false);
  const { data: profiles = [], isLoading } = useProfiles();

  const options: EmployeeOption[] = useMemo(() => {
    return (profiles ?? []).map((p: any) => ({
      id: p.id,
      full_name: p.full_name ?? null,
      employee_code: p.employee_code ?? null,
      department_name: p.departments?.name ?? null,
      designation_name: p.designation ?? null,
      email: p.email ?? null,
    }));
  }, [profiles]);

  const selected = useMemo(() => options.find((o) => o.id === value) || null, [options, value]);

  const triggerLabel = selected
    ? `${selected.full_name ?? selected.email ?? selected.id.slice(0, 8)}${selected.employee_code ? ` · ${selected.employee_code}` : ''}`
    : asFilter
      ? 'All employees'
      : 'Select employee…';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('w-full justify-between font-normal', !selected && 'text-muted-foreground', className)}
        >
          <span className="flex items-center gap-2 truncate">
            <Search className="h-3.5 w-3.5 shrink-0 opacity-50" />
            <span className="truncate">{triggerLabel}</span>
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(420px,90vw)] p-0 pointer-events-auto" align="start">
        <Command
          filter={(itemValue, search) => {
            // itemValue is the lowercased composite string we set on each CommandItem
            return itemValue.includes(search.toLowerCase()) ? 1 : 0;
          }}
        >
          <CommandInput placeholder={placeholder} />
          <CommandList>
            <CommandEmpty>{isLoading ? 'Loading…' : 'No employee matches.'}</CommandEmpty>
            {asFilter && value && (
              <CommandGroup>
                <CommandItem
                  value="__clear__"
                  onSelect={() => {
                    onChange(null, null);
                    setOpen(false);
                  }}
                  className="text-muted-foreground"
                >
                  Clear filter
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup>
              {options.map((opt) => {
                const composite = [opt.full_name, opt.employee_code, opt.email, opt.department_name]
                  .filter(Boolean)
                  .join(' ')
                  .toLowerCase();
                return (
                  <CommandItem
                    key={opt.id}
                    value={composite}
                    onSelect={() => {
                      onChange(opt.id, opt);
                      setOpen(false);
                    }}
                    className="flex items-start gap-2"
                  >
                    <Check className={cn('mt-1 h-4 w-4 shrink-0', value === opt.id ? 'opacity-100' : 'opacity-0')} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{opt.full_name ?? opt.email ?? '—'}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {opt.employee_code ?? '—'}{opt.department_name ? ` · ${opt.department_name}` : ''}
                      </div>
                    </div>
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