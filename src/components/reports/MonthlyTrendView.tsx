import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, FileSpreadsheet, AlertTriangle, Play, Loader2, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import * as XLSX from 'xlsx';
import { useMonthlyTrend, buildMonthRange } from '@/hooks/useMonthlyTrend';
import { MonthlyTrendTable } from './MonthlyTrendTable';
import { getPipThreshold } from '@/lib/pmsSettings';

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

const PAGE_SIZE_OPTIONS = [25, 50, 100];

export function MonthlyTrendView({ canExport }: Props) {
  const now = new Date();
  const currentMonth = MONTHS[now.getMonth()];
  const currentYear = now.getFullYear();
  const queryClient = useQueryClient();

  // Default: last 6 months
  const initFrom = shiftMonth(currentMonth, currentYear, -5);
  const [fromMonth, setFromMonth] = useState(initFrom.month);
  const [fromYear, setFromYear] = useState(initFrom.year);
  const [toMonth, setToMonth] = useState(currentMonth);
  const [toYear, setToYear] = useState(currentYear);
  const [search, setSearch] = useState('');

  // Load only on click
  const [requestedRange, setRequestedRange] = useState<null | {
    fromMonth: string; fromYear: number; toMonth: string; toYear: number;
  }>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // BU filter (multi-select via comma). null/empty = all.
  const [buFilter, setBuFilter] = useState<string>('__all__');
  const [pipOnly, setPipOnly] = useState(false);

  const { data: pipThreshold } = useQuery({
    queryKey: ['pms-pip-threshold'],
    queryFn: getPipThreshold,
    staleTime: 5 * 60 * 1000,
  });

  const yearOptions = useMemo(() => {
    const y = currentYear;
    return [y - 2, y - 1, y, y + 1];
  }, [currentYear]);

  const previewRange = useMemo(
    () => buildMonthRange(fromMonth, fromYear, toMonth, toYear),
    [fromMonth, fromYear, toMonth, toYear],
  );
  const rangeInvalid = previewRange.length === 0;

  const applyPreset = (count: number) => {
    const start = shiftMonth(currentMonth, currentYear, -(count - 1));
    setFromMonth(start.month);
    setFromYear(start.year);
    setToMonth(currentMonth);
    setToYear(currentYear);
    setRequestedRange(null);
    setPage(1);
  };

  const handleLoad = () => {
    if (rangeInvalid) return;
    setRequestedRange({ fromMonth, fromYear, toMonth, toYear });
    setPage(1);
    // Force a real refetch even when the range hasn't changed: an earlier
    // failed run may have cached an empty (all-dashes) payload under the
    // same query key, so toggling state alone won't re-issue the request.
    queryClient.invalidateQueries({ queryKey: ['monthly-trend'] });
  };

  const { data, isLoading, isFetching, error, refetch } = useMonthlyTrend({
    fromMonth: requestedRange?.fromMonth ?? fromMonth,
    fromYear: requestedRange?.fromYear ?? fromYear,
    toMonth: requestedRange?.toMonth ?? toMonth,
    toYear: requestedRange?.toYear ?? toYear,
    enabled: !!requestedRange,
  });

  const months = data?.months ?? [];
  const allEmployees = data?.employees ?? [];

  const buOptions = useMemo(() => {
    const set = new Map<string, string>();
    allEmployees.forEach(e => {
      if (e.businessUnitId && e.businessUnitName) set.set(e.businessUnitId, e.businessUnitName);
    });
    return Array.from(set.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allEmployees]);

  // Client-side search + BU + PIP filter (instant, no refetch)
  const filteredEmployees = useMemo(() => {
    const s = search.trim().toLowerCase();
    return allEmployees.filter(e => {
      if (buFilter !== '__all__' && (e.businessUnitId ?? '') !== buFilter) return false;
      if (pipOnly) {
        if (pipThreshold == null) return false;
        if (e.finalOnlyAvg == null || e.finalOnlyAvg >= pipThreshold) return false;
      }
      if (!s) return true;
      return (
        e.fullName.toLowerCase().includes(s) ||
        e.employeeCode.toLowerCase().includes(s) ||
        e.departmentName.toLowerCase().includes(s) ||
        e.businessUnitName.toLowerCase().includes(s) ||
        (e.reportingManagerName ?? '').toLowerCase().includes(s)
      );
    });
  }, [allEmployees, search, buFilter, pipOnly, pipThreshold]);

  const pipCandidates = useMemo(() => {
    if (pipThreshold == null) return [] as typeof allEmployees;
    // Base PIP list is BU-filtered but ignores search and pipOnly toggles.
    return allEmployees.filter(e =>
      (buFilter === '__all__' || (e.businessUnitId ?? '') === buFilter)
      && e.finalOnlyAvg != null
      && e.finalOnlyAvg < pipThreshold,
    );
  }, [allEmployees, buFilter, pipThreshold]);

  const totalPages = Math.max(1, Math.ceil(filteredEmployees.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * pageSize;
  const pagedEmployees = filteredEmployees.slice(pageStart, pageStart + pageSize);

  const handleExport = () => {
    if (!data) return;
    // Export all filtered (not just current page)
    const rows = filteredEmployees.map(emp => {
      const row: Record<string, any> = {
        'Employee Code': emp.employeeCode,
        'Employee Name': emp.fullName,
        'Designation': emp.designation,
        'Department': emp.departmentName,
        'Business Unit': emp.businessUnitName,
        'Reporting Manager': emp.reportingManagerName ?? '',
      };
      months.forEach(m => {
        row[m.label] = emp.monthlyScores[m.key] === null ? '-' : emp.monthlyScores[m.key];
      });
      row['Avg'] = emp.avg === null ? '-' : emp.avg;
      row['Trend'] = emp.trend === 'up' ? 'Improving'
        : emp.trend === 'down' ? 'Declining'
        : emp.trend === 'flat' ? 'Stable' : '-';
      return row;
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Monthly Trend');

    // Second sheet: PIP Candidates (Final-Score-only avg < threshold).
    if (pipThreshold != null && pipCandidates.length > 0) {
      const pipRows = pipCandidates.map(emp => {
        const row: Record<string, any> = {
          'Employee Code': emp.employeeCode,
          'Employee Name': emp.fullName,
          'Designation': emp.designation,
          'Department': emp.departmentName,
          'Business Unit': emp.businessUnitName,
          'Reporting Manager': emp.reportingManagerName ?? '',
        };
        months.forEach(m => {
          row[`${m.label} (Final)`] = emp.monthlyFinalScores[m.key] === null ? '-' : emp.monthlyFinalScores[m.key];
        });
        row['Final-Only Avg'] = emp.finalOnlyAvg ?? '-';
        row['PIP Threshold'] = pipThreshold;
        return row;
      });
      const pipWs = XLSX.utils.json_to_sheet(pipRows);
      XLSX.utils.book_append_sheet(wb, pipWs, 'PIP Candidates');
    }

    const fname = `Monthly_Trend_${fromMonth.slice(0,3)}${fromYear}-${toMonth.slice(0,3)}${toYear}.xlsx`;
    XLSX.writeFile(wb, fname);
  };

  const hasLoaded = !!requestedRange && !!data;

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

          <div className="grid gap-3 md:grid-cols-[1fr_1fr_2fr_auto_auto] items-end">
            <div>
              <label className="text-xs font-medium text-muted-foreground">From</label>
              <div className="flex gap-2 mt-1">
                <Select value={fromMonth} onValueChange={(v) => { setFromMonth(v); setRequestedRange(null); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={String(fromYear)} onValueChange={(v) => { setFromYear(Number(v)); setRequestedRange(null); }}>
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
                <Select value={toMonth} onValueChange={(v) => { setToMonth(v); setRequestedRange(null); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={String(toYear)} onValueChange={(v) => { setToYear(Number(v)); setRequestedRange(null); }}>
                  <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {yearOptions.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Search (filters loaded data)</label>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Employee, code, or department..."
                  className="pl-9"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  disabled={!hasLoaded}
                />
              </div>
            </div>

            <Button onClick={handleLoad} disabled={rangeInvalid || isFetching}>
              {isFetching ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Loading...</>
              ) : (
                <><Play className="h-4 w-4 mr-2" />{hasLoaded ? 'Reload' : 'Load Trend'}</>
              )}
            </Button>

            <Button
              variant="outline"
              onClick={handleExport}
              disabled={!canExport || filteredEmployees.length === 0}
            >
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Excel
            </Button>
          </div>

          {hasLoaded && (
            <div className="flex flex-wrap items-end gap-4 pt-2 border-t">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Business Unit</label>
                <Select value={buFilter} onValueChange={(v) => { setBuFilter(v); setPage(1); }}>
                  <SelectTrigger className="w-[220px] mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Business Units</SelectItem>
                    {buOptions.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {pipThreshold != null && (
                <div className="flex items-center gap-2 pb-2">
                  <Switch id="pip-only" checked={pipOnly} onCheckedChange={(v) => { setPipOnly(v); setPage(1); }} />
                  <Label htmlFor="pip-only" className="text-sm cursor-pointer">
                    Show PIP candidates only (Final Score avg &lt; {pipThreshold.toFixed(2)})
                  </Label>
                </div>
              )}
            </div>
          )}

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
          {error && (
            <div className="flex items-center justify-between gap-2 text-sm text-destructive border border-destructive/30 bg-destructive/10 rounded-md p-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Failed to load trend data. The range may be too wide or the server timed out.
              </div>
              <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {hasLoaded && pipThreshold != null && (
        <Card className="border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-950/10">
          <CardContent className="py-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
            <div className="text-sm">
              <span className="font-semibold text-red-700 dark:text-red-300">
                {pipCandidates.length} PIP candidate{pipCandidates.length === 1 ? '' : 's'}
              </span>
              <span className="text-muted-foreground ml-1">
                — employees with Final-Score average below {pipThreshold.toFixed(2)} in this range
                {buFilter !== '__all__' ? ' (within selected BU)' : ''}.
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {!hasLoaded && !isFetching && !error ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground space-y-3">
            <Play className="h-10 w-10 mx-auto opacity-40" />
            <div>
              <p className="font-medium text-foreground">Pick a range and click <span className="text-primary">Load Trend</span></p>
              <p className="text-sm">Data is fetched only on demand to keep the report fast.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-3">
            <CardTitle>
              Score Trend — {months.length} {months.length === 1 ? 'month' : 'months'}
              <span className="text-sm font-normal text-muted-foreground ml-2">
                ({filteredEmployees.length} of {allEmployees.length} employees)
              </span>
            </CardTitle>

            {hasLoaded && filteredEmployees.length > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Rows per page:</span>
                <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                  <SelectTrigger className="w-[80px] h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardHeader>
          <CardContent>
            <MonthlyTrendTable
              months={months}
              employees={pagedEmployees}
              isLoading={isLoading || isFetching}
              pipThreshold={pipThreshold ?? null}
            />

            {hasLoaded && filteredEmployees.length > 0 && (
              <div className="flex items-center justify-between mt-4 text-sm">
                <span className="text-muted-foreground">
                  Showing {pageStart + 1}–{Math.min(pageStart + pageSize, filteredEmployees.length)} of {filteredEmployees.length}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={safePage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Prev
                  </Button>
                  <span className="text-muted-foreground px-2">
                    Page {safePage} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={safePage >= totalPages}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
