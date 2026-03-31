import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Save } from 'lucide-react';
import { useProductionRates, useProductionDailyEntries, useBulkUpsertDailyEntries } from '@/hooks/useProductionDailyEntries';
import { useAuth } from '@/contexts/AuthContext';
import { formatEmployeeName } from '@/lib/utils';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

type DateRange = 'all' | '1-10' | '11-20' | '21-31';

interface Props {
  programId: string;
  programName?: string;
}

export function ProductionDailyGrid({ programId, programName }: Props) {
  const now = new Date();
  const [month, setMonth] = useState(MONTHS[now.getMonth()]);
  const [year, setYear] = useState(now.getFullYear());
  const [dateRange, setDateRange] = useState<DateRange>('all');
  const { user } = useAuth();

  const { data: rates = [], isLoading: ratesLoading } = useProductionRates(programId);
  const { data: entries = [], isLoading: entriesLoading } = useProductionDailyEntries(programId, month, year);
  const bulkUpsert = useBulkUpsertDailyEntries();

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

  // Initialize from DB
  useEffect(() => {
    const entryMap = new Map((entries as any[]).map((e: any) => [e.employee_id, e.daily_values || {}]));
    const init: Record<string, Record<string, number>> = {};
    (rates as any[]).forEach((r: any) => {
      const existing = entryMap.get(r.employee_id) || {};
      init[r.employee_id] = existing;
    });
    setLocalData(init);
  }, [rates, entries]);

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

  const getAmount = (empId: string, ratePerTon: number): number => {
    return getTotal(empId) * ratePerTon;
  };

  const grandTotal = useMemo(() => {
    return (rates as any[]).reduce((sum, r: any) => sum + getAmount(r.employee_id, Number(r.rate_per_ton)), 0);
  }, [localData, rates]);

  const handleSave = () => {
    const payload = (rates as any[]).map((r: any) => ({
      program_id: programId,
      employee_id: r.employee_id,
      month,
      year,
      daily_values: localData[r.employee_id] || {},
      updated_by: user?.id,
    }));
    bulkUpsert.mutate(payload);
  };

  const isLoading = ratesLoading || entriesLoading;

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
            <ToggleGroupItem value="all">All</ToggleGroupItem>
            <ToggleGroupItem value="1-10">1-10</ToggleGroupItem>
            <ToggleGroupItem value="11-20">11-20</ToggleGroupItem>
            <ToggleGroupItem value="21-31">21-31</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-center text-muted-foreground py-8">Loading...</p>
        ) : (rates as any[]).length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No production rates configured for this program. Add rates in the program's "Production Rates" tab first.</p>
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
                    <TableHead className="sticky left-[380px] bg-background z-10 min-w-[90px]">Rate/Ton</TableHead>
                    {visibleDays.map(d => (
                      <TableHead key={d} className="text-center min-w-[56px] px-1">{d}</TableHead>
                    ))}
                    <TableHead className="text-right min-w-[70px]">Total</TableHead>
                    <TableHead className="text-right min-w-[90px]">Amount (₹)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(rates as any[]).map((r: any) => {
                    const profile = r.profiles;
                    const empVals = localData[r.employee_id] || {};
                    const total = getTotal(r.employee_id);
                    const amount = total * Number(r.rate_per_ton);
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="sticky left-0 bg-background z-10 text-xs font-mono">{profile?.employee_code || '—'}</TableCell>
                        <TableCell className="sticky left-[80px] bg-background z-10 text-xs">{profile?.full_name || '—'}</TableCell>
                        <TableCell className="sticky left-[200px] bg-background z-10 text-xs">{profile?.designation || '—'}</TableCell>
                        <TableCell className="sticky left-[290px] bg-background z-10 text-xs">{profile?.departments?.name || '—'}</TableCell>
                        <TableCell className="sticky left-[380px] bg-background z-10 text-xs font-medium">₹{Number(r.rate_per_ton).toLocaleString('en-IN')}</TableCell>
                        {visibleDays.map(d => (
                          <TableCell key={d} className="px-1">
                            <Input
                              type="number"
                              className="h-7 w-14 text-xs text-center px-1"
                              value={empVals[String(d)] || ''}
                              onChange={e => handleCellChange(r.employee_id, d, e.target.value)}
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
