import { useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/layout/PageHeader';
import { Download, Clock, Users, AlertTriangle, Timer, ChevronLeft, ChevronRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import * as XLSX from 'xlsx';
import { useToast } from '@/hooks/use-toast';
import { useBottleneckReport, ALL_STAGES, STAGE_LABELS, type BottleneckRow } from '@/hooks/useBottleneckReport';
import { format } from 'date-fns';

const STAGE_COLORS: Record<string, string> = {
  kra_set: '#94a3b8',
  self_review: '#3b82f6',
  manager_check: '#f59e0b',
  skip_level_check: '#8b5cf6',
  hr_pms_review: '#ec4899',
  audit: '#f97316',
  management_review: '#ef4444',
};

function DaysPendingBadge({ days }: { days: number }) {
  if (days <= 7) {
    return <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-300">{days}d</Badge>;
  }
  if (days <= 14) {
    return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-700 border-yellow-300">{days}d</Badge>;
  }
  return <Badge variant="destructive">{days}d</Badge>;
}

export default function BottleneckReport() {
  const { toast } = useToast();
  const {
    rows, allFilteredRows, stats, chartData, isLoading,
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

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-5">
          {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-24" />)}
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

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Pending</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Self Review</CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">{stats.selfReview}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Manager</CardTitle>
            <Users className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600">{stats.manager}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Audit / Mgmt</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">{stats.auditMgmt}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Days Pending</CardTitle>
            <Timer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.avgDays}</div>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Bottleneck Distribution by Department</CardTitle>
            <CardDescription>Number of KPIs stuck at each workflow stage</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
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
                      name={STAGE_LABELS[stage].replace('Awaiting ', '')}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
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
                  <TableRow key={row.kpiId}>
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

          {/* Pagination */}
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
