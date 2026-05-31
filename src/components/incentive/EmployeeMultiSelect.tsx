import { useMemo, useState } from 'react';
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
} from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import type { EmployeeOption } from '@/components/admin/EmployeeCombobox';

interface Props {
  employees: EmployeeOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  className?: string;
}

export function EmployeeMultiSelect({
  employees,
  value,
  onChange,
  placeholder = 'Search employee by name or code…',
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const byId = useMemo(() => {
    const m = new Map<string, EmployeeOption>();
    employees.forEach((e) => m.set(e.id, e));
    return m;
  }, [employees]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees.slice(0, 200);
    return employees
      .filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          (e.code ?? '').toLowerCase().includes(q),
      )
      .slice(0, 200);
  }, [employees, search]);

  const toggle = (id: string) => {
    if (value.includes(id)) onChange(value.filter((v) => v !== id));
    else onChange([...value, id]);
  };

  const remove = (id: string) => onChange(value.filter((v) => v !== id));

  return (
    <div className={cn('space-y-2', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
            <span className="truncate text-left">
              {value.length === 0
                ? placeholder
                : `${value.length} employee${value.length > 1 ? 's' : ''} selected`}
            </span>
            <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[420px] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search by name or employee code…"
              value={search}
              onValueChange={setSearch}
              className="h-9"
            />
            <CommandList>
              <CommandEmpty>No employees found.</CommandEmpty>
              <CommandGroup className="max-h-[280px] overflow-y-auto">
                {filtered.map((e) => {
                  const checked = value.includes(e.id);
                  return (
                    <CommandItem
                      key={e.id}
                      onSelect={() => toggle(e.id)}
                      className="cursor-pointer"
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="truncate">{e.name}</span>
                        {e.code && (
                          <span className="text-xs text-muted-foreground">({e.code})</span>
                        )}
                      </div>
                      {checked && <Check className="h-4 w-4 opacity-70" />}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((id) => {
            const e = byId.get(id);
            return (
              <Badge key={id} variant="secondary" className="gap-1 pr-1">
                <span className="truncate max-w-[180px]">
                  {e ? `${e.name}${e.code ? ` (${e.code})` : ''}` : id.slice(0, 8)}
                </span>
                <button
                  type="button"
                  onClick={() => remove(id)}
                  className="rounded hover:bg-muted-foreground/20 p-0.5"
                  aria-label="Remove"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}