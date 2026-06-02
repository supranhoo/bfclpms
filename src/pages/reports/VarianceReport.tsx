import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useReportAccess } from '@/hooks/useReportAccess';
import { useCompanyFilter } from '@/hooks/useCompanyFilter';
import { CompanyFilter } from '@/components/reports/CompanyFilter';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, Search, ChevronLeft, ChevronRight, AlertTriangle, TrendingUp, BarChart3 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import * as XLSX from 'xlsx';
import { useResolvedReportFields } from '@/hooks/useResolvedReportFields';

const VAR_DEFAULT_FIELDS = [
  { field_key: 'company',          default_label: 'Company',          default_sort: 10 },
  { field_key: 'employee_code',    default_label: 'Employee Code',    default_sort: 20, is_required: true },
  { field_key: 'employee_name',    default_label: 'Employee Name',    default_sort: 30, is_required: true },
  { field_key: 'department',       default_label: 'Department',       default_sort: 40 },
  { field_key: 'category',         default_label: 'Category',         default_sort: 50 },
  { field_key: 'kra',              default_label: 'KRA',              default_sort: 60 },
  { field_key: 'kpi',              default_label: 'KPI',              default_sort: 70 },
  { field_key: 'month',            default_label: 'Month',            default_sort: 80 },
  { field_key: 'auditor_score',    default_label: 'Auditor Score',    default_sort: 90 },
  { field_key: 'management_score', default_label: 'Management Score', default_sort: 100 },
  { field_key: 'variance',         default_label: 'Variance',         default_sort: 110 },
] as const;

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const PAGE_SIZE = 50;

interface VarianceRow {
  kpiId: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  department: string;
  category: string;
  kraName: string;
  kpiName: string;
  month: string;
  auditorScore: number;
  managementScore: number;
  variance: number;
}

export default function VarianceReport() {
  const now = new Date();
  const [month, setMonth] = useState(MONTHS[now.getMonth()]);
  const [year, setYear] = useState(now.getFullYear());
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const { canDownload } = useReportAccess();
  const { getCompanyCode } = useCompanyFilter();

  const { data: rawData, isLoading } = useQuery({
    queryKey: ['variance-report', month, year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kpis')
        .select(`
          id, kra_name, kpi_name, category_id, employee_id, review_period,
          review_submissions(auditor_score, management_score),
          profiles!kpis_employee_id_fkey(employee_code, full_name, department_id,
            departments(name)),
          kra_categories!kpis_category_id_fkey(name)
        `)
        .eq('review_period', month)
        .eq('review_year', year);

      if (error) throw error;
      return data || [];
    },
  });

  const rows: VarianceRow[] = useMemo(() => {
    if (!rawData) return [];
    const result: VarianceRow[] = [];

    for (const kpi of rawData) {
      const sub = Array.isArray(kpi.review_submissions)
        ? kpi.review_submissions[0]
        : kpi.review_submissions;
      if (!sub) continue;

      const auditorScore = sub.auditor_score;
      const managementScore = sub.management_score;

      if (auditorScore == null || managementScore == null) continue;
      if (auditorScore === managementScore) continue;

      const profile = Array.isArray(kpi.profiles) ? kpi.profiles[0] : kpi.profiles;
      const dept = profile?.departments;
      const cat = Array.isArray(kpi.kra_categories) ? kpi.kra_categories[0] : kpi.kra_categories;

      result.push({
        kpiId: kpi.id,
        employeeId: kpi.employee_id || '',
        employeeCode: profile?.employee_code || '—',
        employeeName: profile?.full_name || 'Unknown',
        department: (Array.isArray(dept) ? dept[0]?.name : dept?.name) || '—',
        category: cat?.name || '—',
        kraName: kpi.kra_name || '—',
        kpiName: kpi.kpi_name || '—',
        month: kpi.review_period || month,
        auditorScore,
        managementScore,
        variance: managementScore - auditorScore,
      });
    }

    return result.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));
  }, [rawData, month]);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        r.employeeName.toLowerCase().includes(q) ||
        r.employeeCode.toLowerCase().includes(q) ||
        r.kpiName.toLowerCase().includes(q) ||
        r.kraName.toLowerCase().includes(q) ||
        r.department.toLowerCase().includes(q)
    );
  }, [rows, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const avgVariance =
    filtered.length > 0
      ? +(filtered.reduce((s, r) => s + Math.abs(r.variance), 0) / filtered.length).toFixed(2)
      : 0;
  const maxVariance = filtered.length > 0 ? Math.max(...filtered.map((r) => Math.abs(r.variance))) : 0;

  const resolvedFields = useResolvedReportFields('RPT-VAR-001', VAR_DEFAULT_FIELDS);

  const handleExport = () => {
    if (!filtered.length) return;
    const visible = resolvedFields.filter((f) => !f.is_hidden);
    const valueFor = (r: VarianceRow, key: string): string | number => {
      switch (key) {
        case 'company':          return getCompanyCode(r.employeeId);
        case 'employee_code':    return r.employeeCode;
        case 'employee_name':    return r.employeeName;
        case 'department':       return r.department;
        case 'category':         return r.category;
        case 'kra':              return r.kraName;
        case 'kpi':              return r.kpiName;
        case 'month':            return r.month;
        case 'auditor_score':    return r.auditorScore;
        case 'management_score': return r.managementScore;
        case 'variance':         return r.variance;
        default: return '';
      }
    };
    const exportData = filtered.map((r) => {
      const row: Record<string, string | number> = {};
      for (const fld of visible) row[fld.label] = valueFor(r, fld.field_key);
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(exportData, { header: visible.map((f) => f.label) });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Variance Report');
    XLSX.writeFile(wb, `Variance_Report_${month}_${year}.xlsx`);
  };

  const yearOptions = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Variance Report"
        description="KPIs with score differences between Audit and Management review levels"
        backTo="/reports"
      />

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Month</label>
              <Select value={month} onValueChange={(v) => { setMonth(v); setPage(0); }}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Year</label>
              <Select value={String(year)} onValueChange={(v) => { setYear(Number(v)); setPage(0); }}>
                <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, code, KPI, department..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                className="pl-9"
              />
            </div>
            {canDownload('variance') && (
              <Button variant="outline" size="sm" onClick={handleExport} disabled={!filtered.length}>
                <Download className="h-4 w-4 mr-1" /> Export
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" /> Total Variance KPIs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{filtered.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" /> Avg Variance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{avgVariance}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-destructive" /> Max Variance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{maxVariance}</p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <AlertTriangle className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">No variance found</p>
              <p className="text-sm mt-1">
                All KPIs for {month} {year} have matching Audit and Management scores, or scores are not yet entered.
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[80px]">Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>KRA</TableHead>
                      <TableHead className="max-w-[250px]">KPI</TableHead>
                      <TableHead className="w-[90px]">Month</TableHead>
                      <TableHead className="w-[90px] text-center">Audit</TableHead>
                      <TableHead className="w-[90px] text-center">Mgmt</TableHead>
                      <TableHead className="w-[90px] text-center">Variance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paged.map((r) => (
                      <TableRow key={r.kpiId}>
                        <TableCell className="font-mono text-xs">{r.employeeCode}</TableCell>
                        <TableCell className="font-medium">{r.employeeName}</TableCell>
                        <TableCell>{r.department}</TableCell>
                        <TableCell>{r.category}</TableCell>
                        <TableCell>{r.kraName}</TableCell>
                        <TableCell className="max-w-[250px] truncate" title={r.kpiName}>
                          {r.kpiName}
                        </TableCell>
                        <TableCell>{r.month}</TableCell>
                        <TableCell className="text-center">{r.auditorScore.toFixed(2)}</TableCell>
                        <TableCell className="text-center">{r.managementScore.toFixed(2)}</TableCell>
                        <TableCell className="text-center">
                          <Badge className={
                            r.variance > 0
                              ? 'bg-green-100 text-green-800 hover:bg-green-100 border-green-200'
                              : 'bg-red-100 text-red-800 hover:bg-red-100 border-red-200'
                          }>
                            {r.variance > 0 ? '+' : ''}{r.variance.toFixed(2)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <span className="text-sm text-muted-foreground">
                  Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
                </span>
                <div className="flex gap-1">
                  <Button variant="outline" size="icon" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
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
