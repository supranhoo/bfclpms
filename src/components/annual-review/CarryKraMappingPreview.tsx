import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Search, AlertCircle, ChevronDown, User } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import {
  buildCarrySnapshot, selectMonths,
} from '@/services/annualReview/carryKraScore';
import { searchActiveEmployees, type EmployeeLite } from '@/services/annualReview/annualReviewService';
import type { CarryKraConfig } from '@/types/annualReview';
import { KPI_SCALE_MAX } from '@/lib/annualReview/fiscalYear';

function currentFyStart(): number {
  const now = new Date();
  // Fiscal year July → June. Jul..Dec → year; Jan..Jun → previous year.
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
}

function labelForCfg(cfg: CarryKraConfig): string {
  if (cfg.aggregation === 'last_n_months') return `last ${cfg.lastN ?? 6} months`;
  if (cfg.aggregation === 'selected_months') return `${(cfg.months ?? []).length} selected months`;
  return 'overall average';
}

/**
 * Admin-only verification surface mounted inside the Template Editor's Carry
 * KRA config card. Reuses `buildCarrySnapshot` so the preview is byte-for-byte
 * identical to what the employee will see at review time. Read-only.
 */
export function CarryKraMappingPreview({ cfg, weight = 100 }: { cfg: CarryKraConfig; weight?: number }) {
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [employee, setEmployee] = useState<EmployeeLite | null>(null);
  const fyChoices = useMemo(() => {
    const cur = currentFyStart();
    return [cur + 1, cur, cur - 1, cur - 2];
  }, []);
  const [fyStart, setFyStart] = useState<number>(currentFyStart());

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const employees = useQuery({
    queryKey: ['carryKraPreview:employees', debounced],
    queryFn: () => searchActiveEmployees(debounced, 20),
    enabled: pickerOpen,
    staleTime: 30_000,
  });

  const enabled = !!employee?.id;
  const snapshot = useQuery({
    queryKey: ['carryKraPreview', employee?.id, fyStart, cfg, weight],
    queryFn: () => buildCarrySnapshot(employee!.id, fyStart, cfg, weight),
    enabled,
    staleTime: 60_000,
  });

  const selectedSet = new Set(
    snapshot.data ? selectMonths(snapshot.data.monthly, cfg).map((m) => m.month) : [],
  );
  const monthsWithData = snapshot.data?.monthly.filter((m) => m.avg != null).length ?? 0;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-md border bg-background">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-xs font-medium hover:bg-muted/40"
        >
          <span className="flex items-center gap-1.5">
            <Search className="h-3.5 w-3.5" /> Preview employee mapping
          </span>
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 border-t p-2.5">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_140px]">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Employee</Label>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 w-full justify-start text-xs font-normal">
                  <User className="mr-1.5 h-3.5 w-3.5" />
                  {employee
                    ? `${employee.full_name ?? '—'}${employee.employee_code ? ` · ${employee.employee_code}` : ''}`
                    : <span className="text-muted-foreground">Search active employees…</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[320px] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    value={query}
                    onValueChange={setQuery}
                    placeholder="Name or employee code…"
                  />
                  <CommandList>
                    {employees.isLoading && (
                      <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Loading…
                      </div>
                    )}
                    {!employees.isLoading && (employees.data?.length ?? 0) === 0 && (
                      <CommandEmpty>No active employees found.</CommandEmpty>
                    )}
                    <CommandGroup>
                      {(employees.data ?? []).map((e) => (
                        <CommandItem
                          key={e.id}
                          value={e.id}
                          onSelect={() => { setEmployee(e); setPickerOpen(false); }}
                          className="text-xs"
                        >
                          <div className="flex flex-col">
                            <span className="font-medium">{e.full_name ?? '—'}</span>
                            <span className="text-muted-foreground">
                              {[e.employee_code, e.designation].filter(Boolean).join(' · ') || '—'}
                            </span>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Fiscal year</Label>
            <Select value={String(fyStart)} onValueChange={(v) => setFyStart(Number(v))}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {fyChoices.map((y) => (
                  <SelectItem key={y} value={String(y)}>FY {y}–{(y + 1) % 100 < 10 ? `0${(y + 1) % 100}` : (y + 1) % 100}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {!enabled && (
          <p className="text-[11px] text-muted-foreground">
            Pick an employee to fetch their month-wise KRA scores under the current config.
          </p>
        )}

        {enabled && snapshot.isLoading && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Fetching KRA history…
          </div>
        )}

        {snapshot.error && (
          <Alert variant="destructive" className="py-2">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">{(snapshot.error as Error).message}</AlertDescription>
          </Alert>
        )}

        {snapshot.data && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/30 px-2 py-1.5 text-xs">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="font-mono">
                  Achieved {snapshot.data.value.toFixed(2)} / {snapshot.data.maxValue.toFixed(0)}
                </Badge>
                <Badge variant="outline" className="font-mono">
                  Rating {snapshot.data.rating.toFixed(2)} / {KPI_SCALE_MAX}
                </Badge>
                <span className="text-muted-foreground">
                  {monthsWithData} / 12 months with data · {labelForCfg(cfg)}
                </span>
              </div>
              {monthsWithData === 0 && (
                <span className="text-amber-600">No PMS history found for this fiscal year.</span>
              )}
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="h-8 text-xs">Month</TableHead>
                  <TableHead className="h-8 text-right text-xs">KPIs</TableHead>
                  <TableHead className="h-8 text-right text-xs">Rating (/{KPI_SCALE_MAX})</TableHead>
                  <TableHead className="h-8 w-16 text-xs">Used</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {snapshot.data.monthly.map((m) => {
                  const used = selectedSet.has(m.month) && m.avg != null;
                  return (
                    <TableRow key={m.month} className={used ? '' : 'opacity-50'}>
                      <TableCell className="py-1 text-xs">{m.month}</TableCell>
                      <TableCell className="py-1 text-right text-xs tabular-nums">{m.kpiCount}</TableCell>
                      <TableCell className="py-1 text-right text-xs tabular-nums">
                        {m.avg == null ? <span className="text-muted-foreground">—</span> : m.avg.toFixed(2)}
                      </TableCell>
                      <TableCell className="py-1 text-xs">{used ? '✓' : ''}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <p className="text-[10px] text-muted-foreground">
              Read-only. Uses the same <code>buildCarrySnapshot</code> service the employee form runs at review time.
            </p>
          </>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}