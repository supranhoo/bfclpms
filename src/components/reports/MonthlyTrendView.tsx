import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, FileSpreadsheet, AlertTriangle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useMonthlyTrend, buildMonthRange } from '@/hooks/useMonthlyTrend';
import { MonthlyTrendTable } from './MonthlyTrendTable';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function shiftMonth(month: string, year: number, deltaMonths: number) {
  const idx = MONTHS.indexOf(month);
  let totalIdx = idx + deltaMonths;
  let y = year;
  while (totalIdx < 0) { totalIdx += 12; y -= 1; }
  while (totalIdx > 11) { totalIdx -= 12; y += 1; }
  return { month: MONTHS[totalIdx], year: y };
}

interface Props {
  canExport: boolean;
}

export function MonthlyTrendView({ canExport }: Props) {
  const now = new Date();
  const currentMonth = MONTHS[now.getMonth()];
  const currentYear = now.getFullYear();

  // Default: last 6 months ending current month
  const initFrom = shiftMonth(currentMonth, currentYear, -5);
  const [fromMonth, setFromMonth] = useState(initFrom.month);
  const [fromYear, setFromYear] = useState(initFrom.year);
  const [toMonth, setToMonth] = useState(currentMonth);
  const [toYear, setToYear] = useState(currentYear);
  const [search, setSearch] = useState('');

  const yearOptions = useMemo(() => {
    const y = currentYear;
    return [y - 2, y - 1, y, y + 1];
  }, [currentYear]);

  const applyPreset = (months: number) => {
    const start = shiftMonth(currentMonth, currentYear, -(months - 1));
    setFromMonth(start.month);
    setFromYear(start.year);
    setToMonth(currentMonth);
    setToYear(currentYear);
  };

  const { data, isLoading } = useMonthlyTrend({
    fromMonth, fromYear, toMonth, toYear, search,
  });

  const months = data?.months ?? [];
  const employees = data?.employees ?? [];

  const previewRange = useMemo(
    () => buildMonthRange(fromMonth, fromYear, toMonth, toYear),
    [fromMonth, fromYear, toMonth, toYear],
  );
  const rangeInvalid = previewRange.length === 0;

  const handleExport = () => {
    if (!data) return;
    const rows = employees.map(emp => {
      const row: Record<string, any> = {
        'Employee Code': emp.employeeCode,
        'Employee Name': emp.fullName,
        'Designation': emp.designation,
        'Department': emp.departmentName,
      };
      months.forEach(m => {
        row[m.label] = emp.monthlyScores[m.key] === null ? '-' : emp.monthlyScores[m.key];
      });
      row['Avg'] = emp.avg === null ? '-' : emp.avg;
      row['Trend'] = emp.trend === 'up' ? 'Improving' : emp.trend === 'down' ? 'Declining' : emp.trend === 'flat' ? 'Stable' : '-';
      return row;
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Monthly Trend');
    const fname = `Monthly_Trend_${fromMonth.slice(0,3)}${fromYear}-${toMonth.slice(0,3)}${toYear}.xlsx`;
    XLSX.writeFile(wb, fname);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 space-y-4">
          {/* Quick presets */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground mr-2">Quick range:</span>
            <Button variant="outline" size="sm" onClick={() => applyPreset(3)}>Last 3 Months</Button>
            <Button variant="outline" size="sm" onClick={() => applyPreset(6)}>Last 6 Months</Button>
            <Button variant="outline" size="sm" onClick={() => applyPreset(12)}>Last 12 Months</Button>
          </div>

          {/* Range pickers */}
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_2fr_auto] items-end">
            <div>
              <label className="text-xs font-medium text-muted-foreground">From</label>
              <div className="flex gap-2 mt-1">
                <Select value={fromMonth} onValueChange={setFromMonth}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={String(fromYear)} onValueChange={(v) => setFromYear(Number(v))}>
                  <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {yearOptions.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">To</label>
              <div className="flex gap-2 mt-1">
                <Select value={toMonth} onValueChange={setToMonth}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={String(toYear)} onValueChange={(v) => setToYear(Number(v))}>
                  <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {yearOptions.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Search</label>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Employee, code, or department..."
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            <Button
              variant="outline"
              onClick={handleExport}
              disabled={!canExport || employees.length === 0}
            >
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Excel
            </Button>
          </div>

          {rangeInvalid && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Invalid range — "From" must not be after "To".
            </div>
          )}
          {data?.capped && (
            <div className="flex items-center gap-2 text-sm text-yellow-600 dark:text-yellow-400">
              <AlertTriangle className="h-4 w-4" />
              Range capped at last 12 months for performance.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Score Trend — {months.length} {months.length === 1 ? 'month' : 'months'}
            <span className="text-sm font-normal text-muted-foreground ml-2">
              ({employees.length} employees)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <MonthlyTrendTable months={months} employees={employees} isLoading={isLoading} />
        </CardContent>
      </Card>
    </div>
  );
}
