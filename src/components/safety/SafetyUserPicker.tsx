import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import {
  useActiveProfilesLite, formatSafetyProfileLabel, type SafetyProfileLite,
} from '@/hooks/useSafetyOrg';
import { cn } from '@/lib/utils';

/**
 * Idle cap: how many users to render when the search box is empty.
 * When the user starts typing, ALL matching profiles are returned
 * (no cap) so they can find anyone in the organisation — not just
 * the first N alphabetically.
 */
export const SAFETY_USER_PICKER_IDLE_LIMIT = 50;

/** @deprecated kept for backwards-compat with older tests/imports. */
export const SAFETY_USER_PICKER_LIMIT = SAFETY_USER_PICKER_IDLE_LIMIT;

/**
 * Pure filter used by the Safety user picker.
 * Matches by full name, email OR employee code (case-insensitive substring),
 * and caps results to keep the dropdown fast with large orgs.
 */
export function filterSafetyProfiles(
  profiles: SafetyProfileLite[],
  query: string,
  idleLimit: number = SAFETY_USER_PICKER_IDLE_LIMIT,
): SafetyProfileLite[] {
  const q = query.trim().toLowerCase();
  if (!q) return profiles.slice(0, idleLimit);
  // When searching, return ALL matches so users beyond the idle window
  // are still findable by name / email / employee ID.
  return profiles.filter((p) =>
    (p.full_name ?? '').toLowerCase().includes(q) ||
    (p.email ?? '').toLowerCase().includes(q) ||
    (p.employee_code ?? '').toLowerCase().includes(q),
  );
}

interface SafetyUserPickerProps {
  value: string;
  onChange: (userId: string) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  /** Optional extra class for the trigger button. */
  className?: string;
}

/**
 * Searchable user picker for the Safety module.
 * Replaces plain <Select> dropdowns so users can type a name, email or
 * employee ID to find a person. Works inside dialogs (modal popover).
 */
export function SafetyUserPicker({
  value, onChange, placeholder = 'Select user…', disabled, id, className,
}: SafetyUserPickerProps) {
  const { data: profiles = [], isLoading } = useActiveProfilesLite();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selected = useMemo(
    () => profiles.find((p) => p.id === value) ?? null,
    [profiles, value],
  );

  const filtered = useMemo(
    () => filterSafetyProfiles(profiles, search),
    [profiles, search],
  );

  return (
    <Popover modal open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch(''); }}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || isLoading}
          className={cn('w-full justify-between font-normal', !selected && 'text-muted-foreground', className)}
        >
          <span className="truncate">
            {isLoading
              ? 'Loading…'
              : selected
                ? formatSafetyProfileLabel(selected)
                : placeholder}
          </span>
          {isLoading
            ? <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin opacity-50" />
            : <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-72 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search name, email or employee ID…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>No matching user.</CommandEmpty>
            <CommandGroup>
              {filtered.map((p) => (
                <CommandItem
                  key={p.id}
                  value={p.id}
                  onSelect={() => {
                    onChange(p.id);
                    setOpen(false);
                    setSearch('');
                  }}
                >
                  <Check className={cn('mr-2 h-4 w-4 shrink-0', value === p.id ? 'opacity-100' : 'opacity-0')} />
                  <div className="min-w-0">
                    <div className="truncate">{formatSafetyProfileLabel(p)}</div>
                    {p.email && (
                      <div className="truncate text-xs text-muted-foreground">{p.email}</div>
                    )}
                  </div>
                </CommandItem>
              ))}
              {!search.trim() && profiles.length > SAFETY_USER_PICKER_IDLE_LIMIT && (
                <div className="px-3 py-1.5 text-[11px] text-muted-foreground">
                  Showing first {SAFETY_USER_PICKER_IDLE_LIMIT} of {profiles.length} — type to search all users.
                </div>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default SafetyUserPicker;