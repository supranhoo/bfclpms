import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useReportAccess } from '@/hooks/useReportAccess';
import { useCompanyFilter } from '@/hooks/useCompanyFilter';
import { CompanyFilter } from '@/components/reports/CompanyFilter';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, Search, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { getScoreBadgeClass, getScoreLabel } from '@/lib/reviewConstants';
import * as XLSX from 'xlsx';
import { useResolvedReportFields } from '@/hooks/useResolvedReportFields';

const TVM_DEFAULT_FIELDS = [
  { field_key: 'company',                 default_label: 'Company',                 default_sort: 10 },
  { field_key: 'employee_code',           default_label: 'Employee Code',           default_sort: 20, is_required: true },
  { field_key: 'employee_name',           default_label: 'Employee Name',           default_sort: 30, is_required: true },
  { field_key: 'designation',             default_label: 'Designation',             default_sort: 40 },
  { field_key: 'department',              default_label: 'Department',              default_sort: 50 },
  { field_key: 'month',                   default_label: 'Month',                   default_sort: 60 },
  { field_key: 'year',                    default_label: 'Year',                    default_sort: 70 },
  { field_key: 'avg_final_score',         default_label: 'Avg Final Score',         default_sort: 80 },
  { field_key: 'manager_code',            default_label: 'Reporting Manager Code',  default_sort: 90 },
  { field_key: 'manager_name',            default_label: 'Reporting Manager Name',  default_sort: 100 },
  { field_key: 'manager_avg_final_score', default_label: 'Manager Avg Final Score', default_sort: 110 },
] as const;

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const PAGE_SIZE = 50;

interface SummaryRow {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  designation: string;
  department: string;
  month: string;
  year: number;
  avgFinalScore: number | null;
  managerCode: string;
  managerName: string;
  managerAvgFinalScore: number | null;
}

export default function TeamVsManagerScoreReport() {
  const now = new Date();
  const [month, setMonth] = useState(MONTHS[now.getMonth()]);
  const [year, setYear] = useState(now.getFullYear());
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [sortField, setSortField] = useState<'name' | 'mgrCode' | 'empCode' | 'department' | 'avgScore'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
    setPage(0);
  };

  const renderSortableHeader = (label: string, field: typeof sortField, className?: string) => (
    <TableHead
      className={`cursor-pointer select-none hover:text-foreground transition-colors ${className || ''}`}
      onClick={() => toggleSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortField === field
          ? (sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
          : <ArrowUpDown className="h-3 w-3 text-muted-foreground" />}
      </span>
    </TableHead>
  );
  const { canDownload } = useReportAccess();
  const { getCompanyCode } = useCompanyFilter();
  const resolvedFields = useResolvedReportFields('RPT-TVM-001', TVM_DEFAULT_FIELDS);

  const { data: rawData, isLoading } = useQuery({
    queryKey: ['team-vs-manager-score-report', month, year],
    queryFn: async () => {
      const BATCH = 1000;
      const allRows: any[] = [];
      let from = 0;

      while (true) {
        const { data, error } = await supabase
          .from('kpis')
          .select(`
            id, employee_id, weightage,
            review_submissions(final_score, is_na),
            profiles!kpis_employee_id_fkey(
              employee_code, full_name, reporting_manager_id, designation,
              departments(name)
            )
          `)
          .eq('review_period', month)
          .eq('review_year', year)
          .range(from, from + BATCH - 1);

        if (error) {
          console.error('Team vs Manager report fetch error:', error);
          throw error;
        }
        if (!data || data.length === 0) break;
        allRows.push(...data);
        if (data.length < BATCH) break;
        from += BATCH;
      }

      return allRows;
    },
  });

  // Fetch manager profiles
  const managerIds = useMemo(() => {
    if (!rawData) return [];
    const ids = new Set<string>();
    for (const kpi of rawData) {
      const profile = kpi.profiles as any;
      if (profile?.reporting_manager_id) ids.add(profile.reporting_manager_id);
    }
    return Array.from(ids);
  }, [rawData]);

  const { data: managerProfiles } = useQuery({
    queryKey: ['manager-profiles-for-score-report', managerIds],
    queryFn: async () => {
      if (managerIds.length === 0) return [];
      const { data, error } = await supabase
        .from('profiles')
        .select('id, employee_code, full_name')
        .in('id', managerIds);
      if (error) throw error;
      return data || [];
    },
    enabled: managerIds.length > 0,
  });

  const rows: SummaryRow[] = useMemo(() => {
    if (!rawData) return [];

    const managerMap = new Map<string, { code: string; name: string }>();
    (managerProfiles || []).forEach(m => {
      managerMap.set(m.id, { code: m.employee_code || '—', name: m.full_name || '—' });
    });

    // Group KPIs by employee
    const empKpis = new Map<string, { kpis: any[]; profile: any }>();
    for (const kpi of rawData) {
      const profile = kpi.profiles as any;
      if (!kpi.employee_id || !profile) continue;
      if (!empKpis.has(kpi.employee_id)) {
        empKpis.set(kpi.employee_id, { kpis: [], profile });
      }
      empKpis.get(kpi.employee_id)!.kpis.push(kpi);
    }

    // Compute weighted avg final score per employee
    const scoreMap = new Map<string, number | null>();
    empKpis.forEach((val, empId) => {
      let weightedSum = 0;
      let totalWeight = 0;
      for (const kpi of val.kpis) {
        const sub = Array.isArray(kpi.review_submissions)
          ? kpi.review_submissions[0]
          : kpi.review_submissions;
        if (!sub || sub.is_na || sub.final_score === null || sub.final_score === undefined) continue;
        const w = kpi.weightage || 0;
        if (w <= 0) continue;
        weightedSum += sub.final_score * w;
        totalWeight += w;
      }
      scoreMap.set(empId, totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) / 100 : null);
    });

    const result: SummaryRow[] = [];
    empKpis.forEach((val, empId) => {
      const p = val.profile;
      const managerId = p.reporting_manager_id;
      const mgr = managerId ? managerMap.get(managerId) : null;

      result.push({
        employeeId: empId,
        employeeCode: p.employee_code || '—',
        employeeName: p.full_name || '—',
        designation: p.designation || '—',
        department: p.departments?.name || '—',
        month,
        year,
        avgFinalScore: scoreMap.get(empId) ?? null,
        managerCode: mgr?.code || '—',
        managerName: mgr?.name || '—',
        managerAvgFinalScore: managerId ? (scoreMap.get(managerId) ?? null) : null,
      });
    });

    const dir = sortDir === 'asc' ? 1 : -1;
    return result.sort((a, b) => {
      switch (sortField) {
        case 'mgrCode': return a.managerCode.localeCompare(b.managerCode) * dir;
        case 'empCode': return a.employeeCode.localeCompare(b.employeeCode) * dir;
        case 'department': return a.department.localeCompare(b.department) * dir;
        case 'avgScore': return ((a.avgFinalScore ?? -Infinity) - (b.avgFinalScore ?? -Infinity)) * dir;
        default: return a.employeeName.localeCompare(b.employeeName) * dir;
      }
    });
  }, [rawData, managerProfiles, month, year, sortField, sortDir]);

  const filtered = useMemo(() => {
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter(r =>
      r.employeeName.toLowerCase().includes(q) ||
      r.employeeCode.toLowerCase().includes(q) ||
      r.managerName.toLowerCase().includes(q) ||
      r.department.toLowerCase().includes(q)
    );
  }, [rows, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleExport = () => {
    const visible = resolvedFields.filter(fld => !fld.is_hidden);
    const valueFor = (r: SummaryRow, key: string): unknown => {
      switch (key) {
        case 'company':                 return getCompanyCode(r.employeeId);
        case 'employee_code':           return r.employeeCode;
        case 'employee_name':           return r.employeeName;
        case 'designation':             return r.designation;
        case 'department':              return r.department;
        case 'month':                   return r.month;
        case 'year':                    return r.year;
        case 'avg_final_score':         return r.avgFinalScore ?? '—';
        case 'manager_code':            return r.managerCode;
        case 'manager_name':            return r.managerName;
        case 'manager_avg_final_score': return r.managerAvgFinalScore ?? '—';
        default:                        return '';
      }
    };
    const exportData = filtered.map(r => {
      const out: Record<string, unknown> = {};
      for (const fld of visible) out[fld.label] = valueFor(r, fld.field_key);
      return out;
    });
    const ws = XLSX.utils.json_to_sheet(exportData, { header: visible.map(fld => fld.label) });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Team Vs Manager Score');
    XLSX.writeFile(wb, `Team_Vs_Manager_Score_${month}_${year}.xlsx`);
  };

  const renderScore = (score: number | null) => {
    if (score === null || score === undefined) {
      return <Badge variant="outline" className="text-muted-foreground">—</Badge>;
    }
    const rounded = Math.round(Math.min(5, Math.max(0, score)));
    return (
      <Badge className={getScoreBadgeClass(rounded)}>
        {score.toFixed(2)}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team Vs Manager Monthly Score Summary"
        description="Compare employee and manager weighted average final scores for the selected month"
        backTo="/reports"
      />

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
            <div className="flex flex-wrap gap-3">
              <Select value={month} onValueChange={v => { setMonth(v); setPage(0); }}>
                <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={String(year)} onValueChange={v => { setYear(Number(v)); setPage(0); }}>
                <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[year - 1, year, year + 1].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search employee, manager, dept…"
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(0); }}
                  className="pl-9 w-[250px]"
                />
              </div>
            </div>
            {canDownload('team-vs-manager-score') && (
              <Button variant="outline" size="sm" onClick={handleExport} disabled={filtered.length === 0}>
                <Download className="h-4 w-4 mr-1" /> Export
              </Button>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : paged.length === 0 ? (
            <p className="text-center text-muted-foreground py-10">No data found for {month} {year}</p>
          ) : (
            <>
              <div className="rounded-md border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {renderSortableHeader('Emp Code', 'empCode')}
                      <TableHead>Employee Name</TableHead>
                      <TableHead>Designation</TableHead>
                      {renderSortableHeader('Department', 'department')}
                      <TableHead>Month</TableHead>
                      <TableHead>Year</TableHead>
                      {renderSortableHeader('Avg Final Score', 'avgScore', 'text-center')}
                      {renderSortableHeader('Mgr Code', 'mgrCode')}
                      <TableHead>Manager Name</TableHead>
                      <TableHead className="text-center">Mgr Avg Final Score</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paged.map(r => (
                      <TableRow key={r.employeeId}>
                        <TableCell className="font-mono text-xs">{r.employeeCode}</TableCell>
                        <TableCell className="font-medium">{r.employeeName}</TableCell>
                        <TableCell>{r.designation}</TableCell>
                        <TableCell>{r.department}</TableCell>
                        <TableCell>{r.month}</TableCell>
                        <TableCell>{r.year}</TableCell>
                        <TableCell className="text-center">{renderScore(r.avgFinalScore)}</TableCell>
                        <TableCell className="font-mono text-xs">{r.managerCode}</TableCell>
                        <TableCell>{r.managerName}</TableCell>
                        <TableCell className="text-center">{renderScore(r.managerAvgFinalScore)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
                </p>
                <div className="flex gap-1">
                  <Button variant="outline" size="icon" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
