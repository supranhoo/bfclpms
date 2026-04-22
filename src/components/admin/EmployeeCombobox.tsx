import { useState, useMemo } from 'react';
import { Check, ChevronsUpDown, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

export interface EmployeeOption {
  id: string;
  name: string;
  code: string;
  department: string;
}

interface BaseProps {
  employees: EmployeeOption[];
  excludeIds?: string[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  className?: string;
  duplicateCounts?: Record<string, number>;
}

interface SingleProps extends BaseProps {
  multiple?: false;
  value: string;
  onChange: (id: string) => void;
}

interface MultiProps extends BaseProps {
  multiple: true;
  value: string[];
  onChange: (ids: string[]) => void;
}

type Props = SingleProps | MultiProps;

function matches(emp: EmployeeOption, q: string) {
  if (!q) return true;
  const s = q.toLowerCase();
  return (
    emp.name.toLowerCase().includes(s) ||
    emp.code.toLowerCase().includes(s) ||
    emp.department.toLowerCase().includes(s)
  );
}

export function EmployeeCombobox(props: Props) {
  const {
    employees,
    excludeIds,
    placeholder = 'Click to search employee…',
    searchPlaceholder = 'Search by name, code, or department…',
    emptyMessage = 'No employees found.',
    className,
    duplicateCounts,
  } = props;

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const excludeSet = useMemo(() => new Set(excludeIds || []), [excludeIds]);

  const filtered = useMemo(() => {
    return employees.filter((e) => !excludeSet.has(e.id) && matches(e, search));
  }, [employees, excludeSet, search]);

  // ---------- SINGLE-SELECT ----------
  if (!props.multiple) {
    const value = props.value;
    const selected = employees.find((e) => e.id === value);

    return (
      <div className={cn('space-y-2', className)}>
        <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch(''); }}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="w-full justify-between font-normal h-10"
            >
              <span className="flex items-center gap-2 truncate">
                <Search className="h-4 w-4 opacity-50 shrink-0" />
                {selected ? (
                  <span className="truncate">
                    {selected.name}
                    {selected.code && <span className="text-muted-foreground"> · {selected.code}</span>}
                    {selected.department && <span className="text-muted-foreground"> · {selected.department}</span>}
                  </span>
                ) : (
                  <span className="text-muted-foreground">{placeholder}</span>
                )}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder={searchPlaceholder}
                value={search}
                onValueChange={setSearch}
              />
              <CommandList>
                <CommandEmpty>{emptyMessage}</CommandEmpty>
                <CommandGroup>
                  {filtered.slice(0, 100).map((emp) => (
                    <CommandItem
                      key={emp.id}
                      value={emp.id}
                      onSelect={() => {
                        props.onChange(emp.id);
                        setOpen(false);
                      }}
                      className="cursor-pointer"
                    >
                      <Check
                        className={cn('mr-2 h-4 w-4', value === emp.id ? 'opacity-100' : 'opacity-0')}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{emp.name}</span>
                          {emp.code && (
                            <Badge variant="outline" className="text-[10px] h-4 px-1">{emp.code}</Badge>
                          )}
                        </div>
                        {emp.department && (
                          <span className="text-xs text-muted-foreground truncate">{emp.department}</span>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {selected && (
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">{selected.name}</Badge>
            <button
              type="button"
              className="text-xs text-muted-foreground underline"
              onClick={() => props.onChange('')}
            >
              Change
            </button>
          </div>
        )}
      </div>
    );
  }

  // ---------- MULTI-SELECT ----------
  const values = props.value;
  const selectedSet = new Set(values);
  const selectedEmployees = useMemo(
    () => values.map((id) => employees.find((e) => e.id === id)).filter(Boolean) as EmployeeOption[],
    [values, employees],
  );

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((e) => selectedSet.has(e.id));

  const toggle = (id: string) => {
    if (selectedSet.has(id)) props.onChange(values.filter((v) => v !== id));
    else props.onChange([...values, id]);
  };

  const toggleAllFiltered = () => {
    if (allFilteredSelected) {
      const filteredIds = new Set(filtered.map((e) => e.id));
      props.onChange(values.filter((v) => !filteredIds.has(v)));
    } else {
      const merged = new Set(values);
      filtered.forEach((e) => merged.add(e.id));
      props.onChange([...merged]);
    }
  };

  const triggerLabel =
    values.length === 0
      ? placeholder
      : `${values.length} employee${values.length === 1 ? '' : 's'} selected`;

  return (
    <div className={cn('space-y-2', className)}>
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch(''); }}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal h-10"
          >
            <span className="flex items-center gap-2 truncate">
              <Search className="h-4 w-4 opacity-50 shrink-0" />
              <span className={cn('truncate', values.length === 0 && 'text-muted-foreground')}>
                {triggerLabel}
              </span>
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={searchPlaceholder}
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty>{emptyMessage}</CommandEmpty>
              {filtered.length > 0 && (
                <>
                  <CommandGroup>
                    <CommandItem onSelect={toggleAllFiltered} className="cursor-pointer">
                      <Checkbox checked={allFilteredSelected} className="mr-2 pointer-events-none" tabIndex={-1} />
                      <span className="font-medium">
                        {allFilteredSelected ? 'Deselect All' : 'Select All'}
                        {search && ` (${filtered.length} match)`}
                      </span>
                    </CommandItem>
                  </CommandGroup>
                  <CommandSeparator />
                </>
              )}
              <CommandGroup className="max-h-[280px] overflow-y-auto">
                {filtered.map((emp) => {
                  const checked = selectedSet.has(emp.id);
                  const dup = duplicateCounts?.[emp.id] || 0;
                  return (
                    <CommandItem
                      key={emp.id}
                      value={emp.id}
                      onSelect={() => toggle(emp.id)}
                      className="cursor-pointer"
                    >
                      <Checkbox checked={checked} className="mr-2 pointer-events-none" tabIndex={-1} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{emp.name}</span>
                          {emp.code && (
                            <Badge variant="outline" className="text-[10px] h-4 px-1">{emp.code}</Badge>
                          )}
                        </div>
                        {emp.department && (
                          <span className="text-xs text-muted-foreground truncate">{emp.department}</span>
                        )}
                      </div>
                      {dup > 0 && checked && (
                        <Badge variant="secondary" className="ml-2 text-[10px] h-4 px-1 shrink-0">
                          {dup} dup
                        </Badge>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selectedEmployees.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedEmployees.map((emp) => (
            <Badge key={emp.id} variant="secondary" className="text-xs gap-1 pr-1">
              <span className="truncate max-w-[160px]">{emp.name}</span>
              {emp.code && <span className="text-muted-foreground">· {emp.code}</span>}
              <button
                type="button"
                onClick={() => toggle(emp.id)}
                className="ml-0.5 rounded-sm hover:bg-muted-foreground/20 p-0.5"
                aria-label={`Remove ${emp.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}