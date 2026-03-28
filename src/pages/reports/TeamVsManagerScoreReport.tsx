import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useReportAccess } from '@/hooks/useReportAccess';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { getScoreBadgeClass, getScoreLabel } from '@/lib/reviewConstants';
import * as XLSX from 'xlsx';

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
  const { canDownload } = useReportAccess();

  const { data: rawData, isLoading } = useQuery({
    queryKey: ['team-vs-manager-score-report', month, year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kpis')
        .select(`
          id, employee_id, weightage,
          review_submissions(final_score, is_na),
          profiles!kpis_employee_id_fkey(
            employee_code, full_name, reporting_manager_id,
            departments(name),
            designations(name)
          )
        `)
        .eq('review_period', month)
        .eq('review_year', year);

      if (error) throw error;
      return data || [];
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
        designation: p.designations?.name || '—',
        department: p.departments?.name || '—',
        month,
        year,
        avgFinalScore: scoreMap.get(empId) ?? null,
        managerCode: mgr?.code || '—',
        managerName: mgr?.name || '—',
        managerAvgFinalScore: managerId ? (scoreMap.get(managerId) ?? null) : null,
      });
    });

    return result.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  }, [rawData, managerProfiles, month, year]);

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
    const exportData = filtered.map(r => ({
      'Employee Code': r.employeeCode,
      'Employee Name': r.employeeName,
      'Designation': r.designation,
      'Department': r.department,
      'Month': r.month,
      'Year': r.year,
      'Avg Final Score': r.avgFinalScore ?? '—',
      'Reporting Manager Code': r.managerCode,
      'Reporting Manager Name': r.managerName,
      'Manager Avg Final Score': r.managerAvgFinalScore ?? '—',
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
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
                      <TableHead>Emp Code</TableHead>
                      <TableHead>Employee Name</TableHead>
                      <TableHead>Designation</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Month</TableHead>
                      <TableHead>Year</TableHead>
                      <TableHead className="text-center">Avg Final Score</TableHead>
                      <TableHead>Mgr Code</TableHead>
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
