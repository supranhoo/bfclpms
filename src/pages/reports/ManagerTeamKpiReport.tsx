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
import { Download, Search, ChevronLeft, ChevronRight, Users, TrendingUp, BarChart3 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import * as XLSX from 'xlsx';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const PAGE_SIZE = 50;

interface MismatchRow {
  kpiId: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  department: string;
  kpiName: string;
  managerName: string;
  employeeScore: number;
  managerScore: number;
  variance: number;
}

export default function ManagerTeamKpiReport() {
  const now = new Date();
  const [month, setMonth] = useState(MONTHS[now.getMonth()]);
  const [year, setYear] = useState(now.getFullYear());
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const { canDownload } = useReportAccess();

  const { data: rawData, isLoading } = useQuery({
    queryKey: ['manager-team-kpi-report', month, year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kpis')
        .select(`
          id, kpi_name, employee_id, review_period,
          review_submissions(final_score),
          profiles!kpis_employee_id_fkey(employee_code, full_name, department_id, reporting_manager_id,
            departments(name))
        `)
        .eq('review_period', month)
        .eq('review_year', year);

      if (error) throw error;
      return data || [];
    },
  });

  const rows: MismatchRow[] = useMemo(() => {
    if (!rawData) return [];

    // Build manager KPI map: { managerId -> { kpiName -> finalScore } }
    // Also build manager name map
    const managerScoreMap: Record<string, Record<string, number>> = {};
    const managerNameMap: Record<string, string> = {};

    for (const kpi of rawData) {
      const sub = Array.isArray(kpi.review_submissions)
        ? kpi.review_submissions[0]
        : kpi.review_submissions;
      if (!sub?.final_score) continue;

      const employeeId = kpi.employee_id;
      if (!employeeId) continue;

      if (!managerScoreMap[employeeId]) {
        managerScoreMap[employeeId] = {};
      }
      managerScoreMap[employeeId][kpi.kpi_name] = sub.final_score;

      // Store name for manager lookup
      const profile = Array.isArray(kpi.profiles) ? kpi.profiles[0] : kpi.profiles;
      if (profile?.full_name) {
        managerNameMap[employeeId] = profile.full_name;
      }
    }

    // Now find mismatches
    const result: MismatchRow[] = [];

    for (const kpi of rawData) {
      const profile = Array.isArray(kpi.profiles) ? kpi.profiles[0] : kpi.profiles;
      if (!profile?.reporting_manager_id) continue;

      const sub = Array.isArray(kpi.review_submissions)
        ? kpi.review_submissions[0]
        : kpi.review_submissions;
      if (!sub?.final_score) continue;

      const managerId = profile.reporting_manager_id;
      const managerKpis = managerScoreMap[managerId];
      if (!managerKpis) continue;

      const managerFinalScore = managerKpis[kpi.kpi_name];
      if (managerFinalScore == null) continue;
      if (managerFinalScore === sub.final_score) continue;

      const dept = profile?.departments;
      const variance = sub.final_score - managerFinalScore;

      result.push({
        kpiId: kpi.id,
        employeeCode: profile?.employee_code || '—',
        employeeName: profile?.full_name || 'Unknown',
        department: (Array.isArray(dept) ? dept[0]?.name : dept?.name) || '—',
        kpiName: kpi.kpi_name || '—',
        managerName: managerNameMap[managerId] || '—',
        employeeScore: sub.final_score,
        managerScore: managerFinalScore,
        variance,
      });
    }

    return result.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));
  }, [rawData]);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        r.employeeName.toLowerCase().includes(q) ||
        r.employeeCode.toLowerCase().includes(q) ||
        r.kpiName.toLowerCase().includes(q) ||
        r.department.toLowerCase().includes(q) ||
        r.managerName.toLowerCase().includes(q)
    );
  }, [rows, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const avgVariance =
    filtered.length > 0
      ? +(filtered.reduce((s, r) => s + Math.abs(r.variance), 0) / filtered.length).toFixed(2)
      : 0;
  const maxVariance = filtered.length > 0 ? Math.max(...filtered.map((r) => Math.abs(r.variance))) : 0;

  const handleExport = () => {
    if (!filtered.length) return;
    const ws = XLSX.utils.json_to_sheet(
      filtered.map((r) => ({
        'Month': month,
        'Company': getCompanyCode(r.employeeId),
        'Employee Code': r.employeeCode,
        'Employee Name': r.employeeName,
        Department: r.department,
        'KPI Name': r.kpiName,
        'Manager Name': r.managerName,
        'Employee Score': r.employeeScore,
        'Manager Score': r.managerScore,
        Variance: r.variance,
      }))
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Manager vs Team KPI');
    XLSX.writeFile(wb, `Manager_Team_KPI_${month}_${year}.xlsx`);
  };

  const yearOptions = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Same KPI — Manager vs Team"
        description="KPIs shared between managers and their team members with different final scores"
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
                placeholder="Search by name, code, KPI, department, manager..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                className="pl-9"
              />
            </div>
            {canDownload('manager-team-kpi') && (
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
              <Users className="h-4 w-4 text-primary" /> Total Mismatched KPIs
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
              <Users className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">No mismatches found</p>
              <p className="text-sm mt-1">
                All shared KPIs for {month} {year} have matching scores between managers and their team members.
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[80px]">Code</TableHead>
                      <TableHead>Employee</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead className="max-w-[250px]">KPI Name</TableHead>
                      <TableHead>Manager</TableHead>
                      <TableHead className="w-[100px] text-center">Employee Score</TableHead>
                      <TableHead className="w-[100px] text-center">Manager Score</TableHead>
                      <TableHead className="w-[90px] text-center">Variance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paged.map((r, idx) => (
                      <TableRow key={`${r.kpiId}-${idx}`}>
                        <TableCell className="font-mono text-xs">{r.employeeCode}</TableCell>
                        <TableCell className="font-medium">{r.employeeName}</TableCell>
                        <TableCell>{r.department}</TableCell>
                        <TableCell className="max-w-[250px] truncate" title={r.kpiName}>
                          {r.kpiName}
                        </TableCell>
                        <TableCell>{r.managerName}</TableCell>
                        <TableCell className="text-center">{r.employeeScore.toFixed(2)}</TableCell>
                        <TableCell className="text-center">{r.managerScore.toFixed(2)}</TableCell>
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
