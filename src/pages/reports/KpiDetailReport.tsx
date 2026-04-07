import { useState, useMemo } from 'react';
import { useReportAccess } from '@/hooks/useReportAccess';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompanyFilter } from '@/hooks/useCompanyFilter';
import { CompanyFilter } from '@/components/reports/CompanyFilter';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Download, Search, ChevronLeft, ChevronRight, FileSpreadsheet, Hash, AlertCircle, TrendingUp } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { FrequencyLockToggle } from '@/components/ui/FrequencyLockToggle';
import { isKpiLockedForPeriod } from '@/lib/frequencyUtils';
import { useBulkEmployeeWorkflows } from '@/hooks/useWorkflowConfig';
import * as XLSX from 'xlsx';

const FULL_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

// Final score fallback chain — same as all existing reports
function resolveFinalScore(sub: any, status?: string): number | null {
  if (!sub) return null;
  const v =
    (status === 'approved' ? sub.final_score : null) ??
    sub.management_score ??
    sub.auditor_score ??
    sub.hr_pms_score ??
    sub.skip_level_score ??
    sub.manager_score ??
    sub.self_score;
  return v ?? null;
}

function ratingLabel(score: number | null): string | null {
  if (score === null) return null;
  if (score >= 4.5) return 'Outstanding';
  if (score >= 3.5) return 'Exceeds Expectations';
  if (score >= 2.5) return 'Meets Expectations';
  return 'Below Expectations';
}

interface KpiDetailRow {
  kpiId: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  department: string;
  category: string;
  kraName: string;
  kpiName: string;
  reviewPeriod: string;
  reviewYear: number;
  weightage: number;
  status: string;
  selfScore: number | null;
  managerScore: number | null;
  skipLevelScore: number | null;
  hrPmsScore: number | null;
  auditorScore: number | null;
  managementScore: number | null;
  finalScore: number | null;
  totalScore: number | null;
  outOfScore: number | null;
  percentage: number | null;
  overallRating: string | null;
  isNa: boolean;
  isFrequencyLocked: boolean;
  isOrphaned: boolean;
}

// Compact score cell
function ScoreCell({ score, isNa, isLocked }: { score: number | null; isNa: boolean; isLocked?: boolean }) {
  if (isLocked) return <Badge variant="outline" className="text-xs px-1 py-0 bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400 border-0">Locked</Badge>;
  if (isNa) return <Badge variant="secondary" className="text-xs px-1 py-0">N/A</Badge>;
  if (score === null) return <span className="text-muted-foreground text-xs">—</span>;
  return <span className="tabular-nums text-xs">{score}</span>;
}

// Calculated column cell
function CalcCell({ value, isNa, isLocked, format }: { value: number | null; isNa: boolean; isLocked?: boolean; format?: 'percent' | 'decimal' }) {
  if (isLocked || isNa || value === null) return <span className="text-muted-foreground text-xs">—</span>;
  if (format === 'percent') return <span className="tabular-nums text-xs">{value.toFixed(1)}%</span>;
  return <span className="tabular-nums text-xs">{value.toFixed(2)}</span>;
}

export default function KpiDetailReport() {
  const { canDownload } = useReportAccess();
  const canExport = canDownload('kpi-detail');
  const currentYear = new Date().getFullYear();

  const [selectedYear, setSelectedYear] = useState(currentYear.toString());
  const [selectedPeriod, setSelectedPeriod] = useState('all');
  const [selectedDept, setSelectedDept] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [includeNa, setIncludeNa] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [showFreqLocked, setShowFreqLocked] = useState(false);

  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  // Fetch categories for filter
  const { data: categories } = useQuery({
    queryKey: ['kpi-detail-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kra_categories')
        .select('id, name')
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
  });

  // Main data fetch — batched KPIs with nested joins
  const { data: rows, isLoading } = useQuery({
    queryKey: ['kpi-detail-report', selectedYear, selectedPeriod],
    queryFn: async () => {
      const year = parseInt(selectedYear);
      const allKpis: any[] = [];
      let offset = 0;
      const batchSize = 1000;
      let hasMore = true;

      while (hasMore) {
        let q = supabase
          .from('kpis')
          .select(`
            id,
            employee_id,
            kra_name,
            kpi_name,
            weightage,
            frequency,
            review_period,
            review_year,
            status,
            kra_categories ( name ),
            review_submissions (
              self_score,
              manager_score,
              skip_level_score,
              hr_pms_score,
              auditor_score,
              management_score,
              final_score,
              is_na
            )
          `)
          .eq('review_year', year)
          .range(offset, offset + batchSize - 1);

        if (selectedPeriod !== 'all') {
          q = q.eq('review_period', selectedPeriod);
        }

        const { data: kpis, error } = await q;
        if (error) throw error;

        if (kpis && kpis.length > 0) {
          allKpis.push(...kpis);
          offset += batchSize;
          hasMore = kpis.length === batchSize;
        } else {
          hasMore = false;
        }
      }

      // Fetch profiles with department info
      const { data: profiles, error: profErr } = await supabase
        .from('profiles')
        .select('id, employee_code, full_name, departments ( name )');
      if (profErr) throw profErr;

      const profileMap = new Map((profiles ?? []).map(p => [p.id, p]));

      const result: KpiDetailRow[] = allKpis.map(kpi => {
        const profile = profileMap.get(kpi.employee_id);
        const sub = Array.isArray(kpi.review_submissions)
          ? kpi.review_submissions[0]
          : kpi.review_submissions;
        const isNa = sub?.is_na ?? false;
        const isFrequencyLocked = selectedPeriod !== 'all' && isKpiLockedForPeriod(kpi.frequency, selectedPeriod, year);
        const weightage = kpi.weightage ?? 0;
        const finalScore = isNa || isFrequencyLocked ? null : resolveFinalScore(sub, kpi.status);
        const totalScore = isNa || isFrequencyLocked || finalScore === null ? null : finalScore * weightage;
        const outOfScore = isNa || isFrequencyLocked ? null : weightage * 5;
        const percentage =
          isNa || isFrequencyLocked || totalScore === null || outOfScore === null || outOfScore === 0
            ? null
            : (totalScore / outOfScore) * 100;
        const overallRating = isNa || isFrequencyLocked ? null : ratingLabel(finalScore);

        return {
          kpiId: kpi.id,
          employeeId: kpi.employee_id,
          employeeCode: profile?.employee_code ?? '—',
          employeeName: profile?.full_name ?? 'Unknown',
          department: (profile?.departments as any)?.name ?? '—',
          category: (kpi.kra_categories as any)?.name ?? '—',
          kraName: kpi.kra_name ?? '—',
          kpiName: kpi.kpi_name ?? '—',
          reviewPeriod: kpi.review_period ?? '—',
          reviewYear: kpi.review_year ?? year,
          weightage,
          status: kpi.status ?? 'kra_set',
          selfScore: sub?.self_score ?? null,
          managerScore: sub?.manager_score ?? null,
          skipLevelScore: sub?.skip_level_score ?? null,
          hrPmsScore: sub?.hr_pms_score ?? null,
          auditorScore: sub?.auditor_score ?? null,
          managementScore: sub?.management_score ?? null,
          finalScore,
          totalScore,
          outOfScore,
          percentage,
          overallRating,
          isNa,
          isFrequencyLocked,
          isOrphaned: false,
        };
      });

      return result;
    },
  });

  // Bulk workflow for orphan detection
  const detailEmployeeIds = useMemo(() => {
    if (!rows) return [];
    const ids = new Set<string>();
    rows.forEach(r => ids.add(r.employeeId));
    return Array.from(ids);
  }, [rows]);

  const { data: detailWorkflowMap } = useBulkEmployeeWorkflows(
    detailEmployeeIds,
    selectedPeriod !== 'all' ? selectedPeriod : undefined,
    selectedPeriod !== 'all' ? parseInt(selectedYear) : undefined
  );

  const enrichedRows = useMemo(() => {
    if (!rows) return [];
    return rows.map(r => {
      const stages = detailWorkflowMap?.get(r.employeeId);

      // Workflow-aware score filtering: blank scores for roles not in the employee's workflow
      const skipLevelScore = stages && !stages.includes('skip_level_check') ? null : r.skipLevelScore;
      const hrPmsScore = stages && !stages.includes('hr_pms_review') ? null : r.hrPmsScore;
      const auditorScore = stages && !stages.includes('audit') ? null : r.auditorScore;
      const managementScore = stages && !stages.includes('management_review') ? null : r.managementScore;

      // Orphan detection
      const isOrphaned = !!(stages && r.status !== 'approved' && r.status !== 'kra_set' && !stages.includes(r.status));

      // Check if any score was blanked
      const scoresChanged = (
        skipLevelScore !== r.skipLevelScore ||
        hrPmsScore !== r.hrPmsScore ||
        auditorScore !== r.auditorScore ||
        managementScore !== r.managementScore
      );

      // Recalculate finalScore for non-approved KPIs when out-of-workflow scores were blanked
      let finalScore = r.finalScore;
      if (scoresChanged && r.status !== 'approved') {
        finalScore = managementScore ?? auditorScore ?? hrPmsScore ?? skipLevelScore ?? r.managerScore ?? r.selfScore ?? null;
        if (r.isNa || r.isFrequencyLocked) finalScore = null;
      }

      // Recalculate derived values when finalScore changed
      if (finalScore !== r.finalScore || scoresChanged) {
        const totalScore = r.isNa || r.isFrequencyLocked || finalScore === null ? null : finalScore * r.weightage;
        const outOfScore = r.isNa || r.isFrequencyLocked ? null : r.weightage * 5;
        const percentage = r.isNa || r.isFrequencyLocked || totalScore === null || outOfScore === null || outOfScore === 0
          ? null : (totalScore / outOfScore) * 100;
        const overallRating = r.isNa || r.isFrequencyLocked ? null : ratingLabel(finalScore);

        return {
          ...r,
          skipLevelScore,
          hrPmsScore,
          auditorScore,
          managementScore,
          finalScore,
          totalScore,
          outOfScore,
          percentage,
          overallRating,
          isOrphaned,
        };
      }

      return { ...r, skipLevelScore, hrPmsScore, auditorScore, managementScore, isOrphaned };
    });
  }, [rows, detailWorkflowMap]);

  // Derived department list from data
  const departments = useMemo(() => {
    if (!enrichedRows) return [];
    const s = new Set<string>();
    enrichedRows.forEach(r => { if (r.department && r.department !== '—') s.add(r.department); });
    return Array.from(s).sort();
  }, [enrichedRows]);

  // Client-side filtering
  const filteredRows = useMemo(() => {
    if (!enrichedRows) return [];
    const term = searchTerm.toLowerCase();
    return enrichedRows.filter(r => {
      if (!includeNa && r.isNa) return false;
      if (!showFreqLocked && r.isFrequencyLocked) return false;
      if (selectedDept !== 'all' && r.department !== selectedDept) return false;
      if (selectedCategory !== 'all' && r.category !== selectedCategory) return false;
      if (term) {
        return (
          r.employeeName.toLowerCase().includes(term) ||
          r.employeeCode.toLowerCase().includes(term) ||
          r.kpiName.toLowerCase().includes(term) ||
          r.kraName.toLowerCase().includes(term)
        );
      }
      return true;
    });
  }, [enrichedRows, searchTerm, selectedDept, selectedCategory, includeNa, showFreqLocked]);

  // Stats
  const stats = useMemo(() => {
    const naCount = filteredRows.filter(r => r.isNa).length;
    const scored = filteredRows.filter(r => !r.isNa && r.finalScore !== null);
    const avgFinal = scored.length
      ? scored.reduce((s, r) => s + (r.finalScore ?? 0), 0) / scored.length
      : null;
    const avgPct = scored.filter(r => r.percentage !== null).length
      ? scored.reduce((s, r) => s + (r.percentage ?? 0), 0) / scored.filter(r => r.percentage !== null).length
      : null;
    return { total: filteredRows.length, naCount, avgFinal, avgPct };
  }, [filteredRows]);

  // Pagination
  const totalPages = Math.ceil(filteredRows.length / pageSize);
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage, pageSize]);

  // Reset page on filter change
  useMemo(() => { setCurrentPage(1); }, [searchTerm, selectedYear, selectedPeriod, selectedDept, selectedCategory, includeNa, showFreqLocked, pageSize]);

  // Excel export
  const handleExport = () => {
    if (!filteredRows.length) return;
    const exportData = filteredRows.map(r => ({
      'Company': getCompanyCode(r.employeeId),
      'Employee Code': r.employeeCode,
      'Employee Name': r.employeeName,
      'Department': r.department,
      'Category': r.category,
      'KRA': r.kraName,
      'KPI': r.kpiName,
      'Month': r.reviewPeriod,
      'Weightage': r.weightage,
      'Self': r.isNa ? 'N/A' : (r.selfScore ?? ''),
      'Manager': r.isNa ? 'N/A' : (r.managerScore ?? ''),
      'Skip-Level': r.isNa ? 'N/A' : (r.skipLevelScore ?? ''),
      'HR PMS': r.isNa ? 'N/A' : (r.hrPmsScore ?? ''),
      'Auditor': r.isNa ? 'N/A' : (r.auditorScore ?? ''),
      'Mgmt': r.isNa ? 'N/A' : (r.managementScore ?? ''),
      'Final': r.isNa ? 'N/A' : (r.finalScore ?? ''),
      'Total Score': r.isNa ? '' : (r.totalScore !== null ? r.totalScore.toFixed(2) : ''),
      'Out of Score': r.isNa ? '' : (r.outOfScore ?? ''),
      'Overall Rating': r.isNa ? 'N/A' : (r.overallRating ?? ''),
      'Percentage': r.isNa ? '' : (r.percentage !== null ? r.percentage.toFixed(1) + '%' : ''),
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    ws['!cols'] = [
      { wch: 14 }, { wch: 28 }, { wch: 22 }, { wch: 22 }, { wch: 30 }, { wch: 35 },
      { wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 10 },
      { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 22 }, { wch: 12 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'KPI Detail');
    XLSX.writeFile(wb, `KPI_Detail_Report_${selectedYear}${selectedPeriod !== 'all' ? `_${selectedPeriod}` : ''}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="KPI Detail Report"
        description="KPI-level drill-down showing all stage scores with weighted totals. N/A KPIs are shown with N/A labels."
        backTo="/reports"
        actions={
          canExport ? (
            <Button onClick={handleExport} disabled={!filteredRows.length}>
              <Download className="mr-2 h-4 w-4" />
              Export Excel
            </Button>
          ) : undefined
        }
      />

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3 items-end">
            {/* Year */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Year</Label>
              <Select value={selectedYear} onValueChange={v => { setSelectedYear(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map(y => (
                    <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Month */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Month</Label>
              <Select value={selectedPeriod} onValueChange={v => { setSelectedPeriod(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Periods</SelectItem>
                  {FULL_MONTHS.map(m => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Department */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Department</Label>
              <Select value={selectedDept} onValueChange={v => { setSelectedDept(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="All Departments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {departments.map(d => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Category */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Category</Label>
              <Select value={selectedCategory} onValueChange={v => { setSelectedCategory(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {(categories ?? []).map(c => (
                    <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Employee Search */}
            <div className="space-y-1 flex-1 min-w-[180px]">
              <Label className="text-xs text-muted-foreground">Search</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Name, code, KRA, KPI…"
                  value={searchTerm}
                  onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                  className="pl-8"
                />
              </div>
            </div>

            {/* N/A toggle */}
            <div className="flex items-center gap-2 pb-0.5">
              <Switch
                id="include-na"
                checked={includeNa}
                onCheckedChange={v => { setIncludeNa(v); setCurrentPage(1); }}
              />
              <Label htmlFor="include-na" className="text-sm cursor-pointer whitespace-nowrap">
                Show N/A KPIs
              </Label>
            </div>

            <FrequencyLockToggle
              checked={showFreqLocked}
              onCheckedChange={v => { setShowFreqLocked(v); setCurrentPage(1); }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1.5">
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Total KPI Rows
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-semibold tabular-nums">{stats.total.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5" />
              N/A KPIs
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-semibold tabular-nums">{stats.naCount.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Hash className="h-3.5 w-3.5" />
              Avg Final Score
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-semibold tabular-nums">
              {stats.avgFinal !== null ? stats.avgFinal.toFixed(2) : '—'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" />
              Avg Percentage
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-semibold tabular-nums">
              {stats.avgPct !== null ? stats.avgPct.toFixed(1) + '%' : '—'}
            </p>
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
          ) : filteredRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <FileSpreadsheet className="h-10 w-10 mb-3 opacity-40" />
              <p className="text-sm">No KPI data found for the selected filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full caption-bottom text-sm" style={{ minWidth: '1900px' }}>
                <thead className="[&_tr]:border-b">
                  <tr className="border-b transition-colors bg-muted/40">
                    {/* Sticky employee columns */}
                    <th className="h-10 px-3 text-left align-middle font-medium text-muted-foreground text-xs sticky left-0 bg-muted/40 z-10 whitespace-nowrap min-w-[110px]">
                      Emp Code
                    </th>
                    <th className="h-10 px-3 text-left align-middle font-medium text-muted-foreground text-xs sticky left-[110px] bg-muted/40 z-10 whitespace-nowrap min-w-[160px]">
                      Employee Name
                    </th>
                    <th className="h-10 px-3 text-left align-middle font-medium text-muted-foreground text-xs min-w-[140px]">Category</th>
                    <th className="h-10 px-3 text-left align-middle font-medium text-muted-foreground text-xs min-w-[160px]">KRA</th>
                    <th className="h-10 px-3 text-left align-middle font-medium text-muted-foreground text-xs min-w-[180px]">KPI</th>
                    <th className="h-10 px-3 text-left align-middle font-medium text-muted-foreground text-xs min-w-[100px]">Month</th>
                    <th className="h-10 px-3 text-center align-middle font-medium text-muted-foreground text-xs w-20">Weightage</th>
                    {/* Score columns */}
                    <th className="h-10 px-2 text-center align-middle font-medium text-muted-foreground text-xs w-16">Self</th>
                    <th className="h-10 px-2 text-center align-middle font-medium text-muted-foreground text-xs w-16">Manager</th>
                    <th className="h-10 px-2 text-center align-middle font-medium text-muted-foreground text-xs w-20">Skip-Level</th>
                    <th className="h-10 px-2 text-center align-middle font-medium text-muted-foreground text-xs w-16">HR PMS</th>
                    <th className="h-10 px-2 text-center align-middle font-medium text-muted-foreground text-xs w-16">Auditor</th>
                    <th className="h-10 px-2 text-center align-middle font-medium text-muted-foreground text-xs w-14">Mgmt</th>
                    <th className="h-10 px-2 text-center align-middle font-medium text-muted-foreground text-xs w-14">Final</th>
                    {/* Calculated */}
                    <th className="h-10 px-2 text-center align-middle font-medium text-muted-foreground text-xs w-24">Total Score</th>
                    <th className="h-10 px-2 text-center align-middle font-medium text-muted-foreground text-xs w-24">Out of Score</th>
                    <th className="h-10 px-3 text-left align-middle font-medium text-muted-foreground text-xs min-w-[150px]">Overall Rating</th>
                    <th className="h-10 px-2 text-center align-middle font-medium text-muted-foreground text-xs w-20">Percentage</th>
                  </tr>
                </thead>
                <tbody className="[&_tr:last-child]:border-0">
                  {pagedRows.map((row, idx) => (
                    <tr
                      key={`${row.kpiId}-${idx}`}
                      className={`border-b transition-colors hover:bg-muted/30 ${row.isNa ? 'opacity-70' : ''}`}
                    >
                      {/* Sticky employee cells */}
                      <td className="px-3 py-2 align-middle sticky left-0 bg-background z-10 text-xs font-mono whitespace-nowrap">
                        {row.employeeCode}
                      </td>
                      <td className="px-3 py-2 align-middle sticky left-[110px] bg-background z-10 text-xs font-medium whitespace-nowrap">
                        {row.employeeName}
                      </td>
                      <td className="px-3 py-2 align-middle text-xs">{row.category}</td>
                      <td className="px-3 py-2 align-middle text-xs">{row.kraName}</td>
                      <td className="px-3 py-2 align-middle text-xs">{row.kpiName}</td>
                      <td className="px-3 py-2 align-middle text-xs whitespace-nowrap">{row.reviewPeriod}</td>
                      <td className="px-3 py-2 align-middle text-center text-xs tabular-nums">{row.weightage}</td>
                      {/* Score cells */}
                      <td className="px-2 py-2 align-middle text-center">
                        <ScoreCell score={row.selfScore} isNa={row.isNa} />
                      </td>
                      <td className="px-2 py-2 align-middle text-center">
                        <ScoreCell score={row.managerScore} isNa={row.isNa} />
                      </td>
                      <td className="px-2 py-2 align-middle text-center">
                        <ScoreCell score={row.skipLevelScore} isNa={row.isNa} />
                      </td>
                      <td className="px-2 py-2 align-middle text-center">
                        <ScoreCell score={row.hrPmsScore} isNa={row.isNa} />
                      </td>
                      <td className="px-2 py-2 align-middle text-center">
                        <ScoreCell score={row.auditorScore} isNa={row.isNa} />
                      </td>
                      <td className="px-2 py-2 align-middle text-center">
                        <ScoreCell score={row.managementScore} isNa={row.isNa} />
                      </td>
                      <td className="px-2 py-2 align-middle text-center">
                        <ScoreCell score={row.finalScore} isNa={row.isNa} />
                      </td>
                      {/* Calculated cells */}
                      <td className="px-2 py-2 align-middle text-center">
                        <CalcCell value={row.totalScore} isNa={row.isNa} format="decimal" />
                      </td>
                      <td className="px-2 py-2 align-middle text-center">
                        <CalcCell value={row.outOfScore} isNa={row.isNa} format="decimal" />
                      </td>
                      <td className="px-3 py-2 align-middle text-xs">
                        {row.isNa ? (
                          <Badge variant="secondary" className="text-xs px-1 py-0">N/A</Badge>
                        ) : row.overallRating ? (
                          <span>{row.overallRating}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2 align-middle text-center">
                        <CalcCell value={row.percentage} isNa={row.isNa} format="percent" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {!isLoading && filteredRows.length > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Rows per page:</span>
                <Select value={pageSize.toString()} onValueChange={v => { setPageSize(parseInt(v)); setCurrentPage(1); }}>
                  <SelectTrigger className="h-8 w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map(s => (
                      <SelectItem key={s} value={s.toString()}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span>
                  {((currentPage - 1) * pageSize) + 1}–{Math.min(currentPage * pageSize, filteredRows.length)} of {filteredRows.length.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm px-2">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
