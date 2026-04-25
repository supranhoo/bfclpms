import { useState, useMemo } from 'react';
import { useReportAccess } from '@/hooks/useReportAccess';
import { useCompanyFilter } from '@/hooks/useCompanyFilter';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { 
  useTrainingNeeds, 
  useTNIByCategory, 
  useTNIByDepartment, 
  useTNISummary,
  useDetectTrainingNeeds,
  TNIPriority,
  TNIStatus,
  TNIGapType,
  PeriodRange
} from '@/hooks/useTNI';
import { useReviewPeriods } from '@/hooks/useKpis';
import { 
  AlertTriangle, 
  BookOpen, 
  Building2, 
  Download, 
  RefreshCw, 
  Search, 
  TrendingDown, 
  User, 
  Users,
  ShieldAlert
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart';
import * as XLSX from 'xlsx';

const PRIORITY_COLORS = {
  high: 'hsl(var(--destructive))',
  medium: 'hsl(var(--warning))',
  low: 'hsl(var(--muted-foreground))',
};

const PRIORITY_BADGE: Record<TNIPriority, 'destructive' | 'outline' | 'secondary'> = {
  high: 'destructive',
  medium: 'outline',
  low: 'secondary',
};

const STATUS_BADGE: Record<TNIStatus, 'destructive' | 'outline' | 'secondary' | 'default'> = {
  identified: 'destructive',
  training_planned: 'outline',
  in_progress: 'default',
  completed: 'secondary',
};

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

type PeriodMode = 'single' | 'qtd' | 'ytd' | 'ay' | 'custom';

/** Build the (month, year) ranges for a given mode. */
function buildRanges(
  mode: PeriodMode,
  endMonth: string,
  endYear: number,
  startMonth?: string,
  startYear?: number,
): PeriodRange[] {
  if (mode === 'single') {
    return [{ month: endMonth, year: endYear }];
  }
  if (mode === 'ytd') {
    const endIdx = MONTHS.indexOf(endMonth);
    return MONTHS.slice(0, endIdx + 1).map(m => ({ month: m, year: endYear }));
  }
  if (mode === 'qtd') {
    const endIdx = MONTHS.indexOf(endMonth);
    const qStart = Math.floor(endIdx / 3) * 3;
    return MONTHS.slice(qStart, endIdx + 1).map(m => ({ month: m, year: endYear }));
  }
  if (mode === 'ay') {
    // Assessment Year: Jul (endYear-1) .. Jun (endYear). If endMonth is Jul..Dec,
    // anchor AY to (endYear .. endYear+1). We use endMonth to disambiguate.
    const endIdx = MONTHS.indexOf(endMonth);
    let ayStartYear: number;
    let ayEndYear: number;
    if (endIdx >= 6) {
      // Jul-Dec → AY starts this year
      ayStartYear = endYear;
      ayEndYear = endYear + 1;
    } else {
      // Jan-Jun → AY started last year
      ayStartYear = endYear - 1;
      ayEndYear = endYear;
    }
    const out: PeriodRange[] = [];
    for (let i = 6; i < 12; i++) out.push({ month: MONTHS[i], year: ayStartYear });
    for (let i = 0; i < 6; i++) out.push({ month: MONTHS[i], year: ayEndYear });
    return out;
  }
  if (mode === 'custom' && startMonth && startYear !== undefined) {
    const out: PeriodRange[] = [];
    const sIdx = MONTHS.indexOf(startMonth);
    const eIdx = MONTHS.indexOf(endMonth);
    if (startYear === endYear) {
      for (let i = sIdx; i <= eIdx; i++) out.push({ month: MONTHS[i], year: startYear });
    } else if (startYear < endYear) {
      for (let i = sIdx; i < 12; i++) out.push({ month: MONTHS[i], year: startYear });
      for (let y = startYear + 1; y < endYear; y++) {
        MONTHS.forEach(m => out.push({ month: m, year: y }));
      }
      for (let i = 0; i <= eIdx; i++) out.push({ month: MONTHS[i], year: endYear });
    }
    return out;
  }
  return [{ month: endMonth, year: endYear }];
}

function rangeLabel(ranges: PeriodRange[]): string {
  if (ranges.length === 0) return '';
  if (ranges.length === 1) return `${ranges[0].month} ${ranges[0].year}`;
  const first = ranges[0];
  const last = ranges[ranges.length - 1];
  return `${first.month.slice(0,3)} ${first.year} → ${last.month.slice(0,3)} ${last.year}`;
}

export default function TNIReport() {
  const { canDownload } = useReportAccess();
  const canExport = canDownload('tni');
  const { getCompanyCode } = useCompanyFilter();
  const currentYear = new Date().getFullYear();
  const currentMonth = MONTHS[new Date().getMonth()];
  const [periodMode, setPeriodMode] = useState<PeriodMode>('single');
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedPeriod, setSelectedPeriod] = useState<string>(currentMonth);
  const [customStartMonth, setCustomStartMonth] = useState<string>(currentMonth);
  const [customStartYear, setCustomStartYear] = useState<number>(currentYear);
  const [detectMonth, setDetectMonth] = useState<string>(currentMonth);
  const [searchTerm, setSearchTerm] = useState('');
  const [gapTypeFilter, setGapTypeFilter] = useState<'all' | 'training' | 'compliance'>('all');
  const [activeTab, setActiveTab] = useState('overview');

  const { data: periods } = useReviewPeriods();

  const periodRanges = useMemo(
    () => buildRanges(periodMode, selectedPeriod, selectedYear, customStartMonth, customStartYear),
    [periodMode, selectedPeriod, selectedYear, customStartMonth, customStartYear],
  );
  const isMulti = periodRanges.length > 1;

  const { data: summary, isLoading: summaryLoading } = useTNISummary(undefined, undefined, periodRanges);
  const { data: categoryData, isLoading: categoryLoading } = useTNIByCategory(undefined, undefined, periodRanges);
  const { data: departmentData, isLoading: departmentLoading } = useTNIByDepartment(undefined, undefined, periodRanges);
  const { data: trainingNeeds, isLoading: needsLoading } = useTrainingNeeds({ periodRanges });
  const detectMutation = useDetectTrainingNeeds();

  const filteredPeriods = useMemo(() => {
    if (!periods) return [];
    return periods.filter(p => p.review_year === selectedYear);
  }, [periods, selectedYear]);

  const uniqueYears = useMemo(() => {
    if (!periods) return [currentYear];
    const years = [...new Set(periods.map(p => p.review_year))];
    if (!years.includes(currentYear)) years.push(currentYear);
    return years.sort((a, b) => b - a);
  }, [periods, currentYear]);

  const filteredNeeds = useMemo(() => {
    if (!trainingNeeds) return [];
    let rows = trainingNeeds;
    if (gapTypeFilter === 'compliance') {
      rows = rows.filter(tn => tn.gap_type === 'compliance');
    } else if (gapTypeFilter === 'training') {
      rows = rows.filter(tn => tn.gap_type !== 'compliance');
    }
    if (!searchTerm) return rows;
    const term = searchTerm.toLowerCase();
    return rows.filter(tn =>
      tn.employee?.full_name?.toLowerCase().includes(term) ||
      tn.employee?.employee_code?.toLowerCase().includes(term) ||
      tn.kpi?.kpi_name?.toLowerCase().includes(term) ||
      tn.category?.name?.toLowerCase().includes(term)
    );
  }, [trainingNeeds, searchTerm, gapTypeFilter]);

  const pieChartData = useMemo(() => {
    if (!summary) return [];
    return [
      { name: 'High Priority', value: summary.highPriority, fill: PRIORITY_COLORS.high },
      { name: 'Medium Priority', value: summary.mediumPriority, fill: PRIORITY_COLORS.medium },
      { name: 'Low Priority', value: summary.lowPriority, fill: PRIORITY_COLORS.low },
    ].filter(d => d.value > 0);
  }, [summary]);

  const handleDetect = () => {
    // Single-month mode: detect on the selected period.
    // Multi-month mode: detect on the user-chosen month from the dropdown (defaults to latest in range).
    if (isMulti) {
      const target = periodRanges.find(r => r.month === detectMonth) ?? periodRanges[periodRanges.length - 1];
      detectMutation.mutate({ reviewPeriod: target.month, reviewYear: target.year });
    } else {
      if (!selectedPeriod) return;
      detectMutation.mutate({ reviewPeriod: selectedPeriod, reviewYear: selectedYear });
    }
  };

  const handleExport = () => {
    if (!trainingNeeds) return;
    const exportData = trainingNeeds.map(tn => ({
      'Company': getCompanyCode(tn.employee_id || ''),
      'Employee Name': tn.employee?.full_name || '',
      'Employee Code': tn.employee?.employee_code || '',
      'Designation': tn.employee?.designation || '',
      'KPI': tn.kpi?.kpi_name || '',
      'KRA': tn.kpi?.kra_name || '',
      'Category': tn.category?.name || '',
      'Score': tn.score,
      'Gap Type': tn.gap_type,
      'Priority': tn.priority,
      'Status': tn.status,
      'Training Recommendation': tn.training_recommendation || '',
      'Period': tn.review_period,
      'Year': tn.review_year,
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(exportData), 'Detail');

    // Monthly Summary sheet — pivot by (Year, Month)
    const buckets = new Map<string, {
      Year: number; Month: string; SkillGaps: number; ComplianceGaps: number;
      HighPriority: number; Employees: Set<string>;
    }>();
    trainingNeeds.forEach(tn => {
      const key = `${tn.review_year}|${tn.review_period}`;
      if (!buckets.has(key)) {
        buckets.set(key, {
          Year: tn.review_year, Month: tn.review_period,
          SkillGaps: 0, ComplianceGaps: 0, HighPriority: 0, Employees: new Set(),
        });
      }
      const b = buckets.get(key)!;
      if (tn.gap_type === 'compliance') b.ComplianceGaps++;
      else b.SkillGaps++;
      if (tn.priority === 'high' && tn.gap_type !== 'compliance') b.HighPriority++;
      if (tn.employee_id) b.Employees.add(tn.employee_id);
    });
    const monthlyRows = periodRanges.map(r => {
      const b = buckets.get(`${r.year}|${r.month}`);
      return {
        'Year': r.year,
        'Month': r.month,
        'Skill Gaps': b?.SkillGaps ?? 0,
        'Compliance Gaps': b?.ComplianceGaps ?? 0,
        'High Priority (Skill)': b?.HighPriority ?? 0,
        'Employees Affected': b?.Employees.size ?? 0,
      };
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(monthlyRows), 'Monthly Summary');

    const rangeTag = isMulti
      ? `${periodMode.toUpperCase()}_${periodRanges[0].month.slice(0,3)}${periodRanges[0].year}-${periodRanges[periodRanges.length-1].month.slice(0,3)}${periodRanges[periodRanges.length-1].year}`
      : `${selectedPeriod}_${selectedYear}`;
    XLSX.writeFile(wb, `TNI_Report_${rangeTag}.xlsx`);
  };

  const isLoading = summaryLoading || categoryLoading || departmentLoading;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Training Needs Identification Report"
        description="Analyze skill gaps and training requirements across the organization"
        backTo="/reports"
        actions={
          <div className="flex items-center gap-2">
            {canExport && (
              <Button variant="outline" size="sm" onClick={handleExport} disabled={!trainingNeeds?.length}>
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            )}
            {isMulti && (
              <Select value={detectMonth} onValueChange={setDetectMonth}>
                <SelectTrigger className="w-36 h-9">
                  <SelectValue placeholder="Detect month" />
                </SelectTrigger>
                <SelectContent>
                  {periodRanges.map(r => (
                    <SelectItem key={`${r.month}-${r.year}`} value={r.month}>
                      {r.month.slice(0,3)} {r.year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button
              size="sm"
              onClick={handleDetect}
              disabled={detectMutation.isPending || (!isMulti && !selectedPeriod)}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${detectMutation.isPending ? 'animate-spin' : ''}`} />
              Detect TNI{isMulti ? ` (${detectMonth.slice(0,3)})` : ''}
            </Button>
          </div>
        }
      />

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-3">
            <ToggleGroup
              type="single"
              value={periodMode}
              onValueChange={(v) => { if (v) setPeriodMode(v as PeriodMode); }}
              className="h-9"
            >
              <ToggleGroupItem value="single" size="sm" className="text-xs px-3 h-9">Month</ToggleGroupItem>
              <ToggleGroupItem value="qtd" size="sm" className="text-xs px-3 h-9">QTD</ToggleGroupItem>
              <ToggleGroupItem value="ytd" size="sm" className="text-xs px-3 h-9">YTD</ToggleGroupItem>
              <ToggleGroupItem value="ay" size="sm" className="text-xs px-3 h-9" title="Assessment Year (Jul–Jun)">
                AY (Jul–Jun)
              </ToggleGroupItem>
              <ToggleGroupItem value="custom" size="sm" className="text-xs px-3 h-9">Custom</ToggleGroupItem>
            </ToggleGroup>

            <div className="h-6 w-px bg-border hidden sm:block" />

            {periodMode === 'custom' && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">From</span>
                <Select value={customStartMonth} onValueChange={setCustomStartMonth}>
                  <SelectTrigger className="w-28 h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map(m => <SelectItem key={m} value={m} className="text-xs">{m.slice(0,3)}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={String(customStartYear)} onValueChange={(v) => setCustomStartYear(Number(v))}>
                  <SelectTrigger className="w-20 h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {uniqueYears.map(y => <SelectItem key={y} value={String(y)} className="text-xs">{y}</SelectItem>)}
                  </SelectContent>
                </Select>
                <span className="text-muted-foreground text-xs">→</span>
              </div>
            )}

            <div className="flex items-center gap-2">
              {periodMode !== 'ay' && (
                <span className="text-xs text-muted-foreground">
                  {periodMode === 'single' ? 'Month' : 'Up to'}
                </span>
              )}
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger className="w-32 h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS.map(m => <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
                <SelectTrigger className="w-20 h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {uniqueYears.map(y => <SelectItem key={y} value={String(y)} className="text-xs">{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <Badge variant="secondary" className="text-xs h-7 px-2.5">
              {periodRanges.length} {periodRanges.length === 1 ? 'month' : 'months'} · {rangeLabel(periodRanges)}
            </Badge>

            {filteredPeriods.length > 0 && (
              <span className="text-[11px] text-muted-foreground ml-auto hidden md:inline">
                {filteredPeriods.length} configured period{filteredPeriods.length !== 1 ? 's' : ''} in {selectedYear}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      {summaryLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Training Needs (Skill Gaps)</CardTitle>
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary?.total || 0}</div>
              <p className="text-xs text-muted-foreground">
                Excludes non-submission penalties
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Compliance Gaps</CardTitle>
              <ShieldAlert className="h-4 w-4 text-amber-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">{summary?.complianceGaps || 0}</div>
              <p className="text-xs text-muted-foreground">Auto-zero / non-submission</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">High Priority (Skill)</CardTitle>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{summary?.highPriority || 0}</div>
              <p className="text-xs text-muted-foreground">Requires immediate training</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Employees Affected</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary?.employeesAffected || 0}</div>
              <p className="text-xs text-muted-foreground">
                {summary?.inProgress || 0} in progress · {summary?.completed || 0} done
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">
            <BookOpen className="h-4 w-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="department">
            <Building2 className="h-4 w-4 mr-2" />
            By Department
          </TabsTrigger>
          <TabsTrigger value="individual">
            <User className="h-4 w-4 mr-2" />
            Individual
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Priority Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Priority Distribution</CardTitle>
                <CardDescription>Training needs by priority level</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-64" />
                ) : pieChartData.length > 0 ? (
                  <ChartContainer config={{}} className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieChartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={2}
                          dataKey="value"
                          label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                        >
                          {pieChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip content={<ChartTooltipContent />} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                ) : (
                  <div className="h-64 flex items-center justify-center text-muted-foreground">
                    No data available
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Category Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Training Needs by Category</CardTitle>
                <CardDescription>Skill gaps grouped by KRA category</CardDescription>
              </CardHeader>
              <CardContent>
                {categoryLoading ? (
                  <Skeleton className="h-64" />
                ) : categoryData && categoryData.length > 0 ? (
                  <ChartContainer config={{}} className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={categoryData.slice(0, 6)} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" />
                        <YAxis dataKey="category_name" type="category" width={100} tick={{ fontSize: 12 }} />
                        <Tooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="high_priority" stackId="a" fill={PRIORITY_COLORS.high} name="High" />
                        <Bar dataKey="medium_priority" stackId="a" fill={PRIORITY_COLORS.medium} name="Medium" />
                        <Bar dataKey="low_priority" stackId="a" fill={PRIORITY_COLORS.low} name="Low" />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                ) : (
                  <div className="h-64 flex items-center justify-center text-muted-foreground">
                    No data available
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Category Table */}
          <Card>
            <CardHeader>
              <CardTitle>Category Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">High</TableHead>
                    <TableHead className="text-right">Medium</TableHead>
                    <TableHead className="text-right">Low</TableHead>
                    <TableHead className="text-right">Employees</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categoryData?.map(cat => (
                    <TableRow key={cat.category_id}>
                      <TableCell className="font-medium">{cat.category_name}</TableCell>
                      <TableCell className="text-right">{cat.total_count}</TableCell>
                      <TableCell className="text-right text-destructive">{cat.high_priority}</TableCell>
                      <TableCell className="text-right">{cat.medium_priority}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{cat.low_priority}</TableCell>
                      <TableCell className="text-right">{cat.employees_affected}</TableCell>
                    </TableRow>
                  ))}
                  {(!categoryData || categoryData.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No training needs identified for this period
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Department Tab */}
        <TabsContent value="department" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Department Overview</CardTitle>
              <CardDescription>Training needs aggregated by department</CardDescription>
            </CardHeader>
            <CardContent>
              {departmentLoading ? (
                <Skeleton className="h-64" />
              ) : departmentData && departmentData.length > 0 ? (
                <ChartContainer config={{}} className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={departmentData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="department_name" tick={{ fontSize: 12 }} />
                      <YAxis />
                      <Tooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="total_needs" fill="hsl(var(--primary))" name="Total Needs" />
                      <Bar dataKey="high_priority" fill={PRIORITY_COLORS.high} name="High Priority" />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-muted-foreground">
                  No data available
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Department Details</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Department</TableHead>
                    <TableHead className="text-right">Total Needs</TableHead>
                    <TableHead className="text-right">High Priority</TableHead>
                    <TableHead className="text-right">Employees</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {departmentData?.map(dept => (
                    <TableRow key={dept.department_id}>
                      <TableCell className="font-medium">{dept.department_name}</TableCell>
                      <TableCell className="text-right">{dept.total_needs}</TableCell>
                      <TableCell className="text-right">
                        {dept.high_priority > 0 && (
                          <Badge variant="destructive">{dept.high_priority}</Badge>
                        )}
                        {dept.high_priority === 0 && '-'}
                      </TableCell>
                      <TableCell className="text-right">{dept.employees_affected}</TableCell>
                    </TableRow>
                  ))}
                  {(!departmentData || departmentData.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        No training needs identified for this period
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Individual Tab */}
        <TabsContent value="individual" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Individual Training Needs</CardTitle>
              <CardDescription>Detailed view of training gaps per employee</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 mb-4">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, code, or KPI..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={gapTypeFilter} onValueChange={(v) => setGapTypeFilter(v as any)}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Gap Types</SelectItem>
                    <SelectItem value="training">Training Needs Only</SelectItem>
                    <SelectItem value="compliance">Compliance Gaps Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {needsLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12" />)}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>KPI/Category</TableHead>
                      <TableHead>Gap Type</TableHead>
                      <TableHead className="text-center">Score</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Recommendation</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredNeeds.map(tn => (
                      <TableRow key={tn.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{tn.employee?.full_name}</div>
                            <div className="text-xs text-muted-foreground">
                              {tn.employee?.employee_code} · {tn.employee?.designation}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{tn.kpi?.kpi_name || '-'}</div>
                            <div className="text-xs text-muted-foreground">{tn.category?.name || '-'}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={tn.gap_type === 'compliance' ? 'outline' : 'secondary'}
                                 className={tn.gap_type === 'compliance' ? 'border-amber-500 text-amber-600' : ''}>
                            {tn.gap_type === 'compliance' ? 'Compliance' : 'Training'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={tn.score && tn.score < 2 ? 'destructive' : 'outline'}>
                            {tn.score?.toFixed(1) || '-'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={PRIORITY_BADGE[tn.priority]}>
                            {tn.priority}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_BADGE[tn.status]}>
                            {tn.status.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-xs truncate">
                          {tn.training_recommendation || '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredNeeds.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          {searchTerm ? 'No matching results' : 'No training needs identified'}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
