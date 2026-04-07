import { useCallback, useState } from 'react';
import { useReportAccess } from '@/hooks/useReportAccess';
import { useCompanyFilter } from '@/hooks/useCompanyFilter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/layout/PageHeader';
import { Download, Clock, Users, Timer, ChevronLeft, ChevronRight, UserCheck, ShieldCheck, Eye, Gavel } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import * as XLSX from 'xlsx';
import { useToast } from '@/hooks/use-toast';
import { useBottleneckReport, ALL_STAGES, STAGE_LABELS, type BottleneckRow, type TopHolder } from '@/hooks/useBottleneckReport';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const STAGE_COLORS: Record<string, string> = {
  awaiting_self_review: '#3b82f6',
  awaiting_manager: '#f59e0b',
  awaiting_skip_level: '#8b5cf6',
  awaiting_hr_pms: '#ec4899',
  awaiting_audit: '#f97316',
  awaiting_management: '#ef4444',
};

const URGENCY_COLORS = { green: '#22c55e', amber: '#f59e0b', red: '#ef4444' };

function DaysPendingBadge({ days }: { days: number }) {
  if (days <= 3) {
    return <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-300">{days}d</Badge>;
  }
  if (days <= 5) {
    return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-700 border-yellow-300">{days}d</Badge>;
  }
  return <Badge variant="destructive">{days}d</Badge>;
}

function SummaryCard({
  label, value, icon: Icon, color, active, onClick,
}: {
  label: string; value: number | string; icon: React.ElementType; color?: string; active?: boolean; onClick?: () => void;
}) {
  return (
    <Card
      className={cn(
        'cursor-pointer transition-all hover:shadow-md',
        active && 'ring-2 ring-primary'
      )}
      onClick={onClick}
    >
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className={cn('h-4 w-4', color || 'text-muted-foreground')} />
      </CardHeader>
      <CardContent>
        <div className={cn('text-3xl font-bold', color)}>{value}</div>
      </CardContent>
    </Card>
  );
}

export default function BottleneckReport() {
  const { canDownload } = useReportAccess();
  const canExport = canDownload('bottleneck');
  const { toast } = useToast();
  const {
    rows, allFilteredRows, stats, urgencyStats, topHolders, chartData, isLoading,
    selectedYear, setSelectedYear,
    selectedPeriod, setSelectedPeriod,
    selectedDepartment, setSelectedDepartment,
    selectedDivision, setSelectedDivision,
    selectedBusinessUnit, setSelectedBusinessUnit,
    selectedStage, setSelectedStage,
    searchQuery, setSearchQuery,
    departments, divisions, businessUnits,
    availableYears, availablePeriods,
    availableMonths, monthWindowStart, setMonthWindowStart,
    employeeChartData, employeeChartDepartment, setEmployeeChartDepartment, employeeChartDepartments,
    page, setPage, totalPages,
  } = useBottleneckReport();

  const [showAllHolders, setShowAllHolders] = useState(false);

  const handleStageClick = useCallback((stage: string) => {
    setSelectedStage(prev => prev === stage ? 'all' : stage);
    setPage(1);
  }, [setSelectedStage, setPage]);

  const handleMonthClick = useCallback((period: string, year: string) => {
    const isActive = selectedPeriod === period && selectedYear === year;
    if (isActive) {
      setSelectedPeriod('all');
      setSelectedYear('all');
    } else {
      setSelectedPeriod(period);
      setSelectedYear(year);
    }
    setPage(1);
  }, [selectedPeriod, selectedYear, setSelectedPeriod, setSelectedYear, setPage]);

  const handleExport = useCallback(() => {
    if (allFilteredRows.length === 0) {
      toast({ title: 'No data to export', variant: 'destructive' });
      return;
    }
    const data = allFilteredRows.map((r: BottleneckRow) => ({
      'Emp Code': r.employeeCode,
      'Employee Name': r.employeeName,
      'Department': r.departmentName,
      'KRA': r.kraName,
      'KPI Name': r.kpiName,
      'Period': r.period,
      'Year': r.year,
      'Current Stage': r.currentStage,
      'Responsible Person': r.responsiblePerson,
      'Days Pending': r.daysPending,
      'Last Updated': format(new Date(r.lastUpdated), 'dd-MMM-yyyy'),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Bottleneck Report');
    XLSX.writeFile(wb, `Bottleneck_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast({ title: 'Report downloaded successfully' });
  }, [allFilteredRows, toast]);

  const urgencyChartData = [
    { name: '0-3 days', value: urgencyStats.green, color: URGENCY_COLORS.green },
    { name: '4-5 days', value: urgencyStats.amber, color: URGENCY_COLORS.amber },
    { name: '6+ days', value: urgencyStats.red, color: URGENCY_COLORS.red },
  ];

  const displayedHolders: TopHolder[] = showAllHolders ? topHolders : topHolders.slice(0, 10);

  // Month tile window (show 3 at a time)
  const visibleMonths = availableMonths.slice(monthWindowStart, monthWindowStart + 3);
  const canScrollLeft = monthWindowStart > 0;
  const canScrollRight = monthWindowStart + 3 < availableMonths.length;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-4 lg:grid-cols-8">
          {[1, 2, 3, 4, 5, 6, 7, 8].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Workflow Bottleneck Report"
        description="Identify where KPIs are stuck, who is responsible, and how long they've been pending"
        backTo="/reports"
        actions={
          canExport ? (
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Export Excel
            </Button>
          ) : undefined
        }
      />

      {/* Row 1: Summary Cards (7) */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 lg:grid-cols-8">
        <SummaryCard label="Total Pending" value={stats.total} icon={Clock} onClick={() => handleStageClick('all')} active={selectedStage === 'all'} />
        <SummaryCard label="Self Review" value={stats.selfReview} icon={Users} color="text-blue-600" onClick={() => handleStageClick('awaiting_self_review')} active={selectedStage === 'awaiting_self_review'} />
        <SummaryCard label="Manager" value={stats.manager} icon={UserCheck} color="text-yellow-600" onClick={() => handleStageClick('awaiting_manager')} active={selectedStage === 'awaiting_manager'} />
        <SummaryCard label="Skip-Level" value={stats.skipLevel} icon={Eye} color="text-violet-600" onClick={() => handleStageClick('awaiting_skip_level')} active={selectedStage === 'awaiting_skip_level'} />
        <SummaryCard label="HR PMS" value={stats.hrPms} icon={ShieldCheck} color="text-pink-600" onClick={() => handleStageClick('awaiting_hr_pms')} active={selectedStage === 'awaiting_hr_pms'} />
        <SummaryCard label="Audit" value={stats.audit} icon={Gavel} color="text-orange-600" onClick={() => handleStageClick('awaiting_audit')} active={selectedStage === 'awaiting_audit'} />
        <SummaryCard label="Management" value={stats.management} icon={ShieldCheck} color="text-red-600" onClick={() => handleStageClick('awaiting_management')} active={selectedStage === 'awaiting_management'} />
        <SummaryCard label="Avg Days" value={stats.avgDays} icon={Timer} />
      </div>

      {/* Row 2: Month Filter Tiles */}
      {availableMonths.length > 0 && (
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            disabled={!canScrollLeft}
            onClick={() => setMonthWindowStart(Math.max(0, monthWindowStart - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <Button
            variant={selectedPeriod === 'all' && selectedYear === 'all' ? 'default' : 'outline'}
            size="sm"
            className="h-8 text-xs"
            onClick={() => { setSelectedPeriod('all'); setSelectedYear('all'); setPage(1); }}
          >
            All
          </Button>

          {visibleMonths.map(m => {
            const isActive = selectedPeriod === m.period && selectedYear === m.year;
            return (
              <Button
                key={`${m.period}-${m.year}`}
                variant={isActive ? 'default' : 'outline'}
                size="sm"
                className="h-8 text-xs"
                onClick={() => handleMonthClick(m.period, m.year)}
              >
                {m.label}
              </Button>
            );
          })}

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            disabled={!canScrollRight}
            onClick={() => setMonthWindowStart(monthWindowStart + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Row 3: Charts — Urgency (1/3) + Department (2/3) */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Urgency Donut (compact) */}
        <Card className="md:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Urgency Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px] flex items-center justify-center">
              {stats.total === 0 ? (
                <p className="text-sm text-muted-foreground">No pending KPIs</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={urgencyChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {urgencyChartData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Department stacked bar (2/3 width) */}
        {chartData.length > 0 ? (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>By Department</CardTitle>
              <CardDescription>KPIs stuck at each workflow stage</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} layout="vertical" margin={{ left: 120 }}>
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="department" width={110} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    {ALL_STAGES.map(stage => (
                      <Bar
                        key={stage}
                        dataKey={stage}
                        stackId="a"
                        fill={STAGE_COLORS[stage]}
                        name={STAGE_LABELS[stage].replace('Awaiting ', '').replace('KRA ', '')}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="md:col-span-2 flex items-center justify-center">
            <CardContent className="py-12">
              <p className="text-muted-foreground text-center">No department data available</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Row 3b: By Employee stacked bar chart */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle>By Employee</CardTitle>
            <CardDescription>Top 15 employees with most pending KPIs by stage</CardDescription>
          </div>
          <Select value={employeeChartDepartment} onValueChange={setEmployeeChartDepartment}>
            <SelectTrigger className="w-44 h-8 text-xs">
              <SelectValue placeholder="Department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {employeeChartDepartments.map(d => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {employeeChartData.length > 0 ? (
            <div className="h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={employeeChartData} layout="vertical" margin={{ left: 140 }}>
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="employee" width={130} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  {ALL_STAGES.map(stage => (
                    <Bar
                      key={stage}
                      dataKey={stage}
                      stackId="a"
                      fill={STAGE_COLORS[stage]}
                      name={STAGE_LABELS[stage].replace('Awaiting ', '').replace('KRA ', '')}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No employee data available</p>
          )}
        </CardContent>
      </Card>

      {/* Row 4: Top Bottleneck Holders */}
      {topHolders.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Top Bottleneck Holders</CardTitle>
              <CardDescription>People with the most pending KPIs, sorted by critical count</CardDescription>
            </div>
            {topHolders.length > 10 && (
              <Button variant="ghost" size="sm" onClick={() => setShowAllHolders(v => !v)}>
                {showAllHolders ? 'Show Top 10' : `Show All (${topHolders.length})`}
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Responsible Person</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="text-center">Pending KPIs</TableHead>
                    <TableHead className="text-center">Critical (7+d)</TableHead>
                    <TableHead className="text-center">Avg Days</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedHolders.map((h, i) => (
                    <TableRow key={i} className={h.criticalCount > 0 ? 'bg-destructive/5' : ''}>
                      <TableCell className="font-medium">{h.name}</TableCell>
                      <TableCell><Badge variant="secondary">{h.role}</Badge></TableCell>
                      <TableCell className="text-center font-semibold">{h.totalPending}</TableCell>
                      <TableCell className="text-center">
                        {h.criticalCount > 0 ? (
                          <Badge variant="destructive">{h.criticalCount}</Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">{h.avgDays}d</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Row 5: Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Select value={selectedYear} onValueChange={v => { setSelectedYear(v); setPage(1); }}>
              <SelectTrigger className="w-32"><SelectValue placeholder="Year" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Years</SelectItem>
                {availableYears.map(y => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedPeriod} onValueChange={v => { setSelectedPeriod(v); setPage(1); }}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Period" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Periods</SelectItem>
                {availablePeriods.map(p => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedDivision} onValueChange={v => { setSelectedDivision(v); setPage(1); }}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Division" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Divisions</SelectItem>
                {divisions.map(d => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedBusinessUnit} onValueChange={v => { setSelectedBusinessUnit(v); setPage(1); }}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Business Unit" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All BUs</SelectItem>
                {businessUnits.map(bu => (
                  <SelectItem key={bu.id} value={bu.id}>{bu.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedDepartment} onValueChange={v => { setSelectedDepartment(v); setPage(1); }}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Department" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {departments.map(d => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedStage} onValueChange={v => { setSelectedStage(v); setPage(1); }}>
              <SelectTrigger className="w-52"><SelectValue placeholder="Stage" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stages</SelectItem>
                {ALL_STAGES.map(s => (
                  <SelectItem key={s} value={s}>{STAGE_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              placeholder="Search employee / KPI..."
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
              className="w-56"
            />
          </div>
        </CardContent>
      </Card>

      {/* Detail Table */}
      <Card>
        <CardHeader>
          <CardTitle>Pending KPI Details</CardTitle>
          <CardDescription>{allFilteredRows.length} KPIs pending across the organization</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Emp Code</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>KPI</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Current Stage</TableHead>
                  <TableHead>Responsible</TableHead>
                  <TableHead className="text-center">Days Pending</TableHead>
                  <TableHead>Last Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(row => (
                  <TableRow
                    key={row.kpiId}
                    className={row.daysPending >= 6 ? 'bg-destructive/5' : ''}
                  >
                    <TableCell className="font-mono text-sm">{row.employeeCode}</TableCell>
                    <TableCell className="font-medium">{row.employeeName}</TableCell>
                    <TableCell className="text-muted-foreground">{row.departmentName}</TableCell>
                    <TableCell className="max-w-[200px] truncate" title={row.kpiName}>{row.kpiName}</TableCell>
                    <TableCell>{row.period}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs whitespace-nowrap">{row.currentStage}</Badge>
                    </TableCell>
                    <TableCell>{row.responsiblePerson}</TableCell>
                    <TableCell className="text-center">
                      <DaysPendingBadge days={row.daysPending} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {format(new Date(row.lastUpdated), 'dd-MMM-yyyy')}
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      No pending KPIs found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages} ({allFilteredRows.length} total)
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
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
