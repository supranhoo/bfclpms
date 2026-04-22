import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Badge } from '@/components/ui/badge';
import { Save } from 'lucide-react';
import { useProductionRates, useProductionDailyEntries, useBulkUpsertDailyEntries, resolveEmployeeRate } from '@/hooks/useProductionDailyEntries';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { fetchAllPaged } from '@/lib/fetchAll';

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
}

export function ProductionDailyGrid({ programId, programName, onMonthYearChange, filterByCompany }: Props) {
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
      const { data: mappings } = await supabase
        .from('incentive_program_mappings')
        .select('mapping_type, mapping_value')
        .eq('program_id', programId);

      if (!mappings || mappings.length === 0) return [];

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
      const companyId = (emp as any).company_id
        || dept?.business_units?.divisions?.company_id
        || null;
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

  const getTotal = (empId: string): number => {
    const vals = localData[empId] || {};
    return Object.values(vals).reduce((sum, v) => sum + (Number(v) || 0), 0);
  };

  const grandTotal = useMemo(() => {
    return Math.round(gridEmployees.reduce((sum, emp) => {
      const rateInfo = employeeRates.get(emp.id);
      const rate = rateInfo?.rate || 0;
      return sum + getTotal(emp.id) * rate;
    }, 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localData, gridEmployees, employeeRates]);

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
          <p className="text-center text-muted-foreground py-8">No employees with resolved production rates. Configure rates in the program's "Production Rates" tab first.</p>
        ) : (
          <>
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
                    <TableHead className="text-right min-w-[70px]">Total</TableHead>
                    <TableHead className="text-right min-w-[90px]">Amount (₹)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gridEmployees.map((emp: any) => {
                    const rateInfo = employeeRates.get(emp.id);
                    const effectiveRate = rateInfo?.rate || 0;
                    const rateSource = rateInfo?.source || 'none';
                    const empVals = localData[emp.id] || {};
                    const total = getTotal(emp.id);
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

            <div className="flex items-center justify-between mt-4">
              <p className="text-sm font-semibold">
                Grand Total: <span className="text-primary">₹{grandTotal.toLocaleString('en-IN')}</span>
              </p>
              <Button onClick={handleSave} disabled={bulkUpsert.isPending}>
                <Save className="h-4 w-4 mr-1" /> Save All
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
