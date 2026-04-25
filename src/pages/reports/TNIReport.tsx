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
import { 
  useTrainingNeeds, 
  useTNIByCategory, 
  useTNIByDepartment, 
  useTNISummary,
  useDetectTrainingNeeds,
  TNIPriority,
  TNIStatus,
  TNIGapType
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

export default function TNIReport() {
  const { canDownload } = useReportAccess();
  const canExport = canDownload('tni');
  const { getCompanyCode } = useCompanyFilter();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedPeriod, setSelectedPeriod] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [gapTypeFilter, setGapTypeFilter] = useState<'all' | 'training' | 'compliance'>('all');
  const [activeTab, setActiveTab] = useState('overview');

  const { data: periods } = useReviewPeriods();
  const { data: summary, isLoading: summaryLoading } = useTNISummary(selectedPeriod || undefined, selectedYear);
  const { data: categoryData, isLoading: categoryLoading } = useTNIByCategory(selectedPeriod || undefined, selectedYear);
  const { data: departmentData, isLoading: departmentLoading } = useTNIByDepartment(selectedPeriod || undefined, selectedYear);
  const { data: trainingNeeds, isLoading: needsLoading } = useTrainingNeeds({
    reviewPeriod: selectedPeriod || undefined,
    reviewYear: selectedYear,
  });
  const detectMutation = useDetectTrainingNeeds();

  const filteredPeriods = useMemo(() => {
    if (!periods) return [];
    return periods.filter(p => p.review_year === selectedYear);
  }, [periods, selectedYear]);

  const uniqueYears = useMemo(() => {
    if (!periods) return [currentYear];
    const years = [...new Set(periods.map(p => p.review_year))];
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
    if (!selectedPeriod) return;
    detectMutation.mutate({ reviewPeriod: selectedPeriod, reviewYear: selectedYear });
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

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'TNI Report');
    XLSX.writeFile(wb, `TNI_Report_${selectedYear}_${selectedPeriod || 'All'}.xlsx`);
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
            <Button 
              size="sm" 
              onClick={handleDetect} 
              disabled={!selectedPeriod || detectMutation.isPending}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${detectMutation.isPending ? 'animate-spin' : ''}`} />
              Detect TNI
            </Button>
          </div>
        }
      />

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                {uniqueYears.map(year => (
                  <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedPeriod || 'all'} onValueChange={(v) => setSelectedPeriod(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="All Periods" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Periods</SelectItem>
                {filteredPeriods.map(p => (
                  <SelectItem key={p.id} value={p.period_name}>{p.period_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
