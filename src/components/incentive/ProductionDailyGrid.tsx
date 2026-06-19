import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { Save, Search, Filter, X, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from 'lucide-react';
import { useProductionRates, useProductionDailyEntries, useBulkUpsertDailyEntries } from '@/hooks/useProductionDailyEntries';
import { resolveEmployeeRate, resolveEmployeeCompanyId } from '@/lib/incentiveRateResolver';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { fetchAllPaged } from '@/lib/fetchAll';
import { useCompanyFilter } from '@/hooks/useCompanyFilter';
import { fetchProgramMappingsPaged } from '@/services/incentiveProgramMappings';
import {
  applyDailyGridFilters,
  paginate,
  pageCount,
  hasActiveFilters,
  EMPTY_FILTERS,
  PAGE_SIZE_OPTIONS,
  type DailyGridFilters,
} from '@/lib/incentiveGrid';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

type DateRange = 'all' | '1-10' | '11-20' | '21-31';

interface Props {
  programId: string;
  programName?: string;
  onMonthYearChange?: (month: string, year: number) => void;
  filterByCompany?: (employeeId: string | undefined | null) => boolean;
  selectedCompanyId?: string;
}

export function ProductionDailyGrid({ programId, programName, onMonthYearChange, filterByCompany, selectedCompanyId }: Props) {
  const now = new Date();
  const [month, setMonth] = useState(MONTHS[now.getMonth()]);
  const [year, setYear] = useState(now.getFullYear());
  const [dateRange, setDateRange] = useState<DateRange>('all');
  const { user } = useAuth();

  const { data: rates = [], isLoading: ratesLoading } = useProductionRates(programId);
  const { data: entries = [], isLoading: entriesLoading } = useProductionDailyEntries(programId, month, year);
  const bulkUpsert = useBulkUpsertDailyEntries();

  useEffect(() => {
    onMonthYearChange?.(month, year);
  }, [month, year, onMonthYearChange]);

  // Fetch mapped employees for this program (from mappings)
  const { data: mappedEmployees = [], isLoading: mappedLoading } = useQuery({
    queryKey: ['mapped-employees-for-grid', programId],
    enabled: !!programId,
    queryFn: async () => {
      // Get mappings for this program
      const mappings = await fetchProgramMappingsPaged(programId);
      if (!mappings.length) return [];

      // Resolve employees from mappings
      const employeeIds = new Set<string>();
      const deptIds: string[] = [];
      const buIds: string[] = [];
      const divIds: string[] = [];
      const desigs: string[] = [];

      for (const m of mappings) {
        if (m.mapping_type === 'employee') employeeIds.add(m.mapping_value);
        else if (m.mapping_type === 'department') deptIds.push(m.mapping_value);
        else if (m.mapping_type === 'business_unit') buIds.push(m.mapping_value);
        else if (m.mapping_type === 'division') divIds.push(m.mapping_value);
        else if (m.mapping_type === 'designation') desigs.push(m.mapping_value);
      }

      // Fetch ALL active profiles (paged — PostgREST caps unranged reads at 1000 rows; active roster ~2.5k)
      const allProfiles = await fetchAllPaged<any>((from, to) =>
        supabase
          .from('profiles')
          .select('id, full_name, employee_code, email, designation, company_id, department_id, departments(id, name, business_unit_id, business_units(id, division_id, divisions(id, company_id)))')
          .eq('is_active', true)
          .order('full_name')
          .range(from, to)
      );
      if (!allProfiles.length) return [];

      return allProfiles.filter(p => {
        if (employeeIds.has(p.id)) return true;
        if (deptIds.length && p.department_id && deptIds.includes(p.department_id)) return true;
        const buId = (p as any).departments?.business_unit_id;
        if (buIds.length && buId && buIds.includes(buId)) return true;
        if (desigs.length && p.designation && desigs.includes(p.designation)) return true;
        return false;
      });
    },
  });

  // daily_values keyed by employee_id
  const [localData, setLocalData] = useState<Record<string, Record<string, number>>>({});

  const daysInMonth = useMemo(() => {
    const monthIdx = MONTHS.indexOf(month);
    return new Date(year, monthIdx + 1, 0).getDate();
  }, [month, year]);

  const visibleDays = useMemo(() => {
    const allDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    switch (dateRange) {
      case '1-10': return allDays.filter(d => d >= 1 && d <= 10);
      case '11-20': return allDays.filter(d => d >= 11 && d <= 20);
      case '21-31': return allDays.filter(d => d >= 21);
      default: return allDays;
    }
  }, [daysInMonth, dateRange]);

  // targetDate = last day of selected month/year (for date-aware rate resolution)
  const targetDate = useMemo(() => {
    const monthIdx = MONTHS.indexOf(month);
    const lastDay = new Date(year, monthIdx + 1, 0);
    return lastDay.toISOString().slice(0, 10);
  }, [month, year]);

  // Resolve effective rates for all mapped employees
  const employeeRates = useMemo(() => {
    const map = new Map<string, { rate: number; source: string }>();
    for (const emp of mappedEmployees) {
      const deptId = emp.department_id;
      const dept = (emp as any).departments;
      const buId = dept?.business_unit_id || null;
      // Use shared resolver — single source of truth, parity with compute edge function.
      const companyId = resolveEmployeeCompanyId({
        profileCompanyId: (emp as any).company_id ?? null,
        departmentId: deptId,
        deptToBu: new Map([[deptId, buId]]),
        buToDivision: buId
          ? new Map([[buId, dept?.business_units?.division_id ?? null]])
          : null,
        divToCompany: dept?.business_units?.division_id
          ? new Map([[dept.business_units.division_id, dept?.business_units?.divisions?.company_id ?? null]])
          : null,
        buToCompany: buId
          ? new Map([[buId, dept?.business_units?.divisions?.company_id ?? null]])
          : null,
      });
      const resolved = resolveEmployeeRate(emp.id, deptId, buId, rates as any[], companyId, targetDate);
      if (resolved.source !== 'none') {
        map.set(emp.id, { rate: resolved.rate, source: resolved.source });
      }
    }
    return map;
  }, [mappedEmployees, rates, targetDate]);

  // Only show employees that have a resolved rate (and pass company filter)
  const gridEmployees = useMemo(() => {
    return mappedEmployees.filter(e => {
      if (!employeeRates.has(e.id)) return false;
      if (filterByCompany && !filterByCompany(e.id)) return false;
      return true;
    });
  }, [mappedEmployees, employeeRates, filterByCompany]);

  // ── Filters + Pagination (client-side) ─────────────────────────────
  const [filters, setFilters] = useState<DailyGridFilters>(EMPTY_FILTERS);
  const [pageSize, setPageSize] = useState<number>(50);
  const [pageIndex, setPageIndex] = useState(0);

  // Reset to first page when context that changes the row set changes.
  useEffect(() => {
    setPageIndex(0);
  }, [programId, month, year, dateRange, filters, pageSize, selectedCompanyId]);

  const rateOf = useCallback(
    (emp: any) => employeeRates.get(emp.id)?.rate ?? 0,
    [employeeRates],
  );

  const filteredEmployees = useMemo(
    () => applyDailyGridFilters(gridEmployees as any[], filters, rateOf),
    [gridEmployees, filters, rateOf],
  );

  const pagedEmployees = useMemo(
    () => paginate(filteredEmployees, pageIndex, pageSize),
    [filteredEmployees, pageIndex, pageSize],
  );

  const totalPages = pageCount(filteredEmployees.length, pageSize);
  const filtersActive = hasActiveFilters(filters);

  // Initialize from DB
  useEffect(() => {
    const entryMap = new Map((entries as any[]).map((e: any) => [e.employee_id, e.daily_values || {}]));
    const init: Record<string, Record<string, number>> = {};
    gridEmployees.forEach((emp: any) => {
      const existing = entryMap.get(emp.id) || {};
      init[emp.id] = existing;
    });
    setLocalData(init);
  }, [gridEmployees, entries]);

  const handleCellChange = (empId: string, day: number, value: string) => {
    const numVal = value === '' ? 0 : parseFloat(value) || 0;
    setLocalData(prev => ({
      ...prev,
      [empId]: {
        ...prev[empId],
        [String(day)]: numVal,
      },
    }));
  };

  const getTotal = (empId: string, days: number[]): number => {
    const vals = localData[empId] || {};
    return days.reduce((sum, d) => sum + (Number(vals[String(d)]) || 0), 0);
  };

  const rangeLabel = useMemo(() => {
    if (dateRange === 'all') return '';
    return ` (${dateRange})`;
  }, [dateRange]);

  const filteredGrandTotal = useMemo(() => {
    return Math.round(filteredEmployees.reduce((sum, emp: any) => {
      const rate = employeeRates.get(emp.id)?.rate || 0;
      return sum + getTotal(emp.id, visibleDays) * rate;
    }, 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localData, filteredEmployees, employeeRates, visibleDays]);

  const pageTotal = useMemo(() => {
    return Math.round(pagedEmployees.reduce((sum, emp: any) => {
      const rate = employeeRates.get(emp.id)?.rate || 0;
      return sum + getTotal(emp.id, visibleDays) * rate;
    }, 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localData, pagedEmployees, employeeRates, visibleDays]);

  const handleSave = () => {
    const payload = gridEmployees.map((emp: any) => ({
      program_id: programId,
      employee_id: emp.id,
      month,
      year,
      daily_values: localData[emp.id] || {},
      updated_by: user?.id,
    }));
    bulkUpsert.mutate(payload);
  };

  const isLoading = ratesLoading || entriesLoading || mappedLoading;

  // Diagnostic empty-state — picks the first matching reason so operators can
  // distinguish "no mappings" vs "no rates" vs "no rate resolved" vs "company
  // filter empty". RCA 2026-06-17.
  const { companies } = useCompanyFilter();
  const companyName = useMemo(() => {
    if (!selectedCompanyId || selectedCompanyId === 'all') return '';
    return companies.find(c => c.id === selectedCompanyId)?.name ?? '';
  }, [companies, selectedCompanyId]);

  const emptyStateMessage = useMemo(() => {
    if (mappedEmployees.length === 0) {
      return 'This program has no employee mappings. Open Program Mapping (Incentive Config) to add employees.';
    }
    if (rates.length === 0) {
      return 'No production rates configured. Open the program\'s "Production Rates" tab to add a rate.';
    }
    if (employeeRates.size === 0) {
      return `Rates exist, but none of the ${mappedEmployees.length} mapped employees resolve to a rate for ${month} ${year}. Check effective dates and employee/department/BU/company coverage.`;
    }
    if (companyName) {
      return `No mapped employees match the selected company filter "${companyName}". Clear the company filter or pick another company.`;
    }
    return 'No employees to display with the current filters.';
  }, [mappedEmployees.length, rates.length, employeeRates.size, companyName, month, year]);

  const sourceBadge = (source: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'outline'> = {
      employee: 'default', department: 'secondary', bu: 'outline', company: 'outline', common: 'outline',
    };
    return <Badge variant={variants[source] || 'outline'} className="text-[10px] ml-1">{source.slice(0, 3)}</Badge>;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3 flex-wrap">
          {programName && <h4 className="text-sm font-semibold">{programName}</h4>}
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
            <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ToggleGroup type="single" value={dateRange} onValueChange={v => v && setDateRange(v as DateRange)} variant="outline" size="sm">
            <ToggleGroupItem value="all">Full Month</ToggleGroupItem>
            <ToggleGroupItem value="1-10">1-10</ToggleGroupItem>
            <ToggleGroupItem value="11-20">11-20</ToggleGroupItem>
            <ToggleGroupItem value="21-31">21-31</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-center text-muted-foreground py-8">Loading...</p>
        ) : gridEmployees.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">{emptyStateMessage}</p>
        ) : (
          <>
            {/* Toolbar: global search + column filters + page size */}
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                <Input
                  value={filters.global}
                  onChange={e => setFilters(f => ({ ...f, global: e.target.value }))}
                  placeholder="Search code, name, desig, dept…"
                  className="h-9 w-64 pl-7 text-sm"
                  aria-label="Search employees"
                />
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9">
                    <Filter className="h-3.5 w-3.5 mr-1" />
                    Column Filters
                    {filtersActive && <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">on</Badge>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 space-y-3" align="start">
                  <div className="grid grid-cols-1 gap-2">
                    <div>
                      <Label className="text-xs">Code</Label>
                      <Input value={filters.code} onChange={e => setFilters(f => ({ ...f, code: e.target.value }))} className="h-8 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs">Name</Label>
                      <Input value={filters.name} onChange={e => setFilters(f => ({ ...f, name: e.target.value }))} className="h-8 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs">Designation</Label>
                      <Input value={filters.designation} onChange={e => setFilters(f => ({ ...f, designation: e.target.value }))} className="h-8 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs">Department</Label>
                      <Input value={filters.department} onChange={e => setFilters(f => ({ ...f, department: e.target.value }))} className="h-8 text-sm" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Rate min</Label>
                        <Input type="number" value={filters.rateMin} onChange={e => setFilters(f => ({ ...f, rateMin: e.target.value }))} className="h-8 text-sm" />
                      </div>
                      <div>
                        <Label className="text-xs">Rate max</Label>
                        <Input type="number" value={filters.rateMax} onChange={e => setFilters(f => ({ ...f, rateMax: e.target.value }))} className="h-8 text-sm" />
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button variant="ghost" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
                      <X className="h-3.5 w-3.5 mr-1" /> Clear all
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
              <Select value={String(pageSize)} onValueChange={v => setPageSize(Number(v))}>
                <SelectTrigger className="h-9 w-[110px] text-sm" aria-label="Rows per page">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map(s => (
                    <SelectItem key={s} value={String(s)}>{s} / page</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground ml-auto">
                Showing <span className="font-medium text-foreground">{pagedEmployees.length}</span>
                {' '}of{' '}
                <span className="font-medium text-foreground">{filteredEmployees.length.toLocaleString('en-IN')}</span>
                {filtersActive && (
                  <> (filtered from {gridEmployees.length.toLocaleString('en-IN')})</>
                )}
              </span>
            </div>

            <div className="overflow-x-auto border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 bg-background z-10 min-w-[80px]">Code</TableHead>
                    <TableHead className="sticky left-[80px] bg-background z-10 min-w-[120px]">Name</TableHead>
                    <TableHead className="sticky left-[200px] bg-background z-10 min-w-[90px]">Desig</TableHead>
                    <TableHead className="sticky left-[290px] bg-background z-10 min-w-[90px]">Dept</TableHead>
                    <TableHead className="sticky left-[380px] bg-background z-10 min-w-[100px]">Rate/Ton</TableHead>
                    {visibleDays.map(d => (
                      <TableHead key={d} className="text-center min-w-[56px] px-1">{d}</TableHead>
                    ))}
                    <TableHead className="text-right min-w-[70px]">Total{rangeLabel}</TableHead>
                    <TableHead className="text-right min-w-[90px]">Amount{rangeLabel} (₹)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedEmployees.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5 + visibleDays.length + 2} className="text-center text-muted-foreground py-6 text-sm">
                        No employees match the current filters.
                      </TableCell>
                    </TableRow>
                  ) : pagedEmployees.map((emp: any) => {
                    const rateInfo = employeeRates.get(emp.id);
                    const effectiveRate = rateInfo?.rate || 0;
                    const rateSource = rateInfo?.source || 'none';
                    const empVals = localData[emp.id] || {};
                    const total = getTotal(emp.id, visibleDays);
                    const amount = Math.round(total * effectiveRate);
                    const deptName = (emp as any).departments?.name || '—';
                    return (
                      <TableRow key={emp.id}>
                        <TableCell className="sticky left-0 bg-background z-10 text-xs font-mono">{emp.employee_code || '—'}</TableCell>
                        <TableCell className="sticky left-[80px] bg-background z-10 text-xs">{emp.full_name || '—'}</TableCell>
                        <TableCell className="sticky left-[200px] bg-background z-10 text-xs">{emp.designation || '—'}</TableCell>
                        <TableCell className="sticky left-[290px] bg-background z-10 text-xs">{deptName}</TableCell>
                        <TableCell className="sticky left-[380px] bg-background z-10 text-xs font-medium">
                          ₹{effectiveRate.toLocaleString('en-IN')}
                          {sourceBadge(rateSource)}
                        </TableCell>
                        {visibleDays.map(d => (
                          <TableCell key={d} className="px-1">
                            <Input
                              type="number"
                              className="h-7 w-14 text-xs text-center px-1"
                              value={empVals[String(d)] || ''}
                              onChange={e => handleCellChange(emp.id, d, e.target.value)}
                              min={0}
                            />
                          </TableCell>
                        ))}
                        <TableCell className="text-right font-semibold text-xs">{total.toLocaleString('en-IN')}</TableCell>
                        <TableCell className="text-right font-semibold text-xs">₹{amount.toLocaleString('en-IN')}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between gap-3 flex-wrap mt-4">
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPageIndex(0)} disabled={pageIndex === 0} aria-label="First page">
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPageIndex(p => Math.max(0, p - 1))} disabled={pageIndex === 0} aria-label="Previous page">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs px-2 tabular-nums">
                  Page <span className="font-medium">{pageIndex + 1}</span> / {totalPages}
                </span>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPageIndex(p => Math.min(totalPages - 1, p + 1))} disabled={pageIndex >= totalPages - 1} aria-label="Next page">
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPageIndex(totalPages - 1)} disabled={pageIndex >= totalPages - 1} aria-label="Last page">
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-muted-foreground">
                  Page Total: <span className="font-semibold text-foreground tabular-nums">₹{pageTotal.toLocaleString('en-IN')}</span>
                </span>
                <span className="font-semibold">
                  {filtersActive ? 'Filtered Total' : 'Grand Total'}:{' '}
                  <span className="text-primary tabular-nums">₹{filteredGrandTotal.toLocaleString('en-IN')}</span>
                </span>
                <Button onClick={handleSave} disabled={bulkUpsert.isPending} title="Saves all mapped employees, not just the visible page.">
                  <Save className="h-4 w-4 mr-1" /> Save All
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
