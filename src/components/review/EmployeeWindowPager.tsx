import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Search, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover, PopoverTrigger, PopoverContent,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';

export interface EmployeeWindowEmp {
  id: string;
  name: string;
  code: string | null;
}

interface Props {
  employees: EmployeeWindowEmp[];
  windowSize: number;
  start: number;                              // 0-based
  onChange: (nextStart: number) => void;
}

/**
 * Compact pager strip for matrix mode — lets reviewers step through the full
 * employee column set in fixed-size windows and jump directly to a specific
 * employee. Pure presentational; no data fetching.
 */
export function EmployeeWindowPager({
  employees, windowSize, start, onChange,
}: Props) {
  const [jumpOpen, setJumpOpen] = useState(false);
  const [filter, setFilter] = useState('');

  const total = employees.length;
  const safeStart = Math.max(0, Math.min(start, Math.max(0, total - 1)));
  const end = Math.min(total, safeStart + windowSize);

  const filtered = useMemo(() => {
    const term = filter.trim().toLowerCase();
    if (!term) return employees;
    return employees.filter(e =>
      (e.name ?? '').toLowerCase().includes(term)
      || (e.code ?? '').toLowerCase().includes(term),
    );
  }, [employees, filter]);

  if (total === 0) return null;

  return (
    <div className="flex items-center gap-2 px-1 py-1 text-xs">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Users className="h-3.5 w-3.5" />
        <span className="tabular-nums">
          Employees{' '}
          <strong className="text-foreground">{total === 0 ? 0 : safeStart + 1}</strong>
          {'–'}
          <strong className="text-foreground">{end}</strong>
          {' of '}
          <strong className="text-foreground">{total}</strong>
        </span>
      </div>

      <div className="flex items-center gap-1 ml-auto">
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2"
          disabled={safeStart <= 0}
          onClick={() => onChange(Math.max(0, safeStart - windowSize))}
          aria-label="Previous employees"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Prev
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2"
          disabled={end >= total}
          onClick={() => onChange(Math.min(total - 1, safeStart + windowSize))}
          aria-label="Next employees"
        >
          Next
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>

        <Popover open={jumpOpen} onOpenChange={setJumpOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2"
              aria-label="Jump to employee"
            >
              <Search className="h-3.5 w-3.5 mr-1" />
              Jump
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-2">
            <Input
              autoFocus
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search name / code…"
              className="h-8 text-xs mb-2"
              aria-label="Filter employees"
            />
            <div className="max-h-64 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="text-xs text-muted-foreground py-3 text-center">No match</p>
              ) : filtered.slice(0, 200).map((e) => {
                const idx = employees.findIndex(x => x.id === e.id);
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => {
                      const nextStart = Math.max(0, Math.min(
                        idx,
                        Math.max(0, total - windowSize),
                      ));
                      onChange(nextStart);
                      setJumpOpen(false);
                      setFilter('');
                    }}
                    className="w-full text-left px-2 py-1.5 rounded hover:bg-muted text-xs flex items-center justify-between gap-2"
                  >
                    <span className="truncate">{e.name}</span>
                    {e.code && (
                      <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                        {e.code}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
