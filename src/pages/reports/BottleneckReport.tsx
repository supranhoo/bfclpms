import { useCallback, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/layout/PageHeader';
import { Download, Clock, Users, Timer, ChevronLeft, ChevronRight, UserCheck, ShieldCheck, Eye } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import * as XLSX from 'xlsx';
import { useToast } from '@/hooks/use-toast';
import { useBottleneckReport, ALL_STAGES, STAGE_LABELS, type BottleneckRow, type TopHolder } from '@/hooks/useBottleneckReport';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const STAGE_COLORS: Record<string, string> = {
  kra_set: '#94a3b8',
  self_review: '#3b82f6',
  manager_check: '#f59e0b',
  skip_level_check: '#8b5cf6',
  hr_pms_review: '#ec4899',
  audit: '#f97316',
  management_review: '#ef4444',
};

const URGENCY_COLORS = { green: '#22c55e', amber: '#f59e0b', red: '#ef4444' };

function DaysPendingBadge({ days }: { days: number }) {
  if (days <= 7) {
    return <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-300">{days}d</Badge>;
  }
  if (days <= 14) {
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
    page, setPage, totalPages,
  } = useBottleneckReport();

  const [showAllHolders, setShowAllHolders] = useState(false);

  const handleStageClick = useCallback((stage: string) => {
    setSelectedStage(prev => prev === stage ? 'all' : stage);
    setPage(1);
  }, [setSelectedStage, setPage]);

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
    { name: '0-7 days', value: urgencyStats.green, color: URGENCY_COLORS.green },
    { name: '8-14 days', value: urgencyStats.amber, color: URGENCY_COLORS.amber },
    { name: '15+ days', value: urgencyStats.red, color: URGENCY_COLORS.red },
  ];

  const displayedHolders: TopHolder[] = showAllHolders ? topHolders : topHolders.slice(0, 10);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-4 lg:grid-cols-7">
          {[1, 2, 3, 4, 5, 6, 7].map(i => <Skeleton key={i} className="h-24" />)}
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
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export Excel
          </Button>
        }
      />

      {/* Row 1: Summary Cards (6) */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <SummaryCard label="Total Pending" value={stats.total} icon={Clock} onClick={() => handleStageClick('all')} active={selectedStage === 'all'} />
        <SummaryCard label="Self Review" value={stats.selfReview} icon={Users} color="text-blue-600" onClick={() => handleStageClick('self_review')} active={selectedStage === 'self_review'} />
        <SummaryCard label="Manager" value={stats.manager} icon={UserCheck} color="text-yellow-600" onClick={() => handleStageClick('manager_check')} active={selectedStage === 'manager_check'} />
        <SummaryCard label="Skip-Level" value={stats.skipLevel} icon={Eye} color="text-violet-600" onClick={() => handleStageClick('skip_level_check')} active={selectedStage === 'skip_level_check'} />
        <SummaryCard label="HR PMS" value={stats.hrPms} icon={ShieldCheck} color="text-pink-600" onClick={() => handleStageClick('hr_pms_review')} active={selectedStage === 'hr_pms_review'} />
        <SummaryCard label="Avg Days" value={stats.avgDays} icon={Timer} />
      </div>

      {/* Row 2: Charts side-by-side */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Urgency Donut */}
        <Card>
          <CardHeader>
            <CardTitle>Urgency Distribution</CardTitle>
            <CardDescription>KPIs by days pending severity</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px] flex items-center justify-center">
              {stats.total === 0 ? (
                <p className="text-muted-foreground">No pending KPIs</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={urgencyChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={3}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {urgencyChartData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Department stacked bar */}
        {chartData.length > 0 && (
          <Card>
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
        )}
      </div>

      {/* Row 3: Top Bottleneck Holders */}
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
                    <TableHead className="text-center">Critical (15+d)</TableHead>
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

      {/* Row 4: Filters */}
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
                    className={row.daysPending > 14 ? 'bg-destructive/5' : ''}
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
