import { useState, useEffect, useMemo, useCallback } from 'react';
import { format } from 'date-fns';
import { useAllKpis, useKpisByPeriod, useOpenQueryCounts, useDistinctKpiPeriods, useAdminDeleteKpi, KPI } from '@/hooks/useKpis';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useKraCategories, useProfiles, useDivisions, useDepartments } from '@/hooks/useOrganization';
import { getStageLabel } from '@/hooks/useWorkflowConfig';
import * as XLSX from 'xlsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatsRowSkeleton, TableSkeleton, FilterBarSkeleton } from '@/components/ui/LoadingSkeletons';
import { AdminKpiEditDialog } from '@/components/admin/AdminKpiEditDialog';
import { AdminKpiCreateDialog } from '@/components/admin/AdminKpiCreateDialog';
import { BulkTemplateAssignDialog } from '@/components/admin/BulkTemplateAssignDialog';
import { ScoringSimulatorPopover } from '@/components/admin/ScoringSimulatorPopover';
import { AdminDataEntryDialog } from '@/components/admin/AdminDataEntryDialog';
import { AdminDailyEntryDialog } from '@/components/admin/AdminDailyEntryDialog';
import { AdminStatusStepBackDialog } from '@/components/admin/AdminStatusStepBackDialog';
import { CopyKrasDialog } from '@/components/admin/CopyKrasDialog';
import { KraIssuanceConfirmDialog } from '@/components/admin/KraIssuanceConfirmDialog';
import { ScoringHealthCheck } from '@/components/admin/ScoringHealthCheck';
import { getPreviousStatus } from '@/hooks/useAdminDataEntry';
import { getCalendarMonthsForPeriod, MONTH_NAMES } from '@/hooks/useAdminReports';
import { Users, Target, AlertTriangle, Plus, PercentIcon, Building2, UserCheck, Download, Building, Library, ChevronDown, ChevronRight, Edit, Building as BuildingIcon, PenLine, CalendarDays, Copy, Trash2, Undo2, Send, CheckCircle, ArrowUp, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

// Full 8-stage workflow order for columns (includes all possible stages)
const WORKFLOW_STAGES = ['kra_set', 'self_review', 'manager_check', 'skip_level_check', 'hr_pms_review', 'audit', 'management_review', 'approved'];

interface EmployeeKpiData {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  departmentName: string;
  managerName: string;
  totalKpis: number;
  orgLevelKpis: number;
  orgLevelFilledKpis: number;
  stageCounts: Record<string, number>;
  stageQueryCounts: Record<string, number>;
  totalWeightage: number;
}

export default function AllKpis() {
  // Default to current month/year for server-side filtering
  const currentMonth = format(new Date(), 'MMMM');
  const currentYear = new Date().getFullYear();

  // Scroll-to-top visibility
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [visibleCount, setVisibleCount] = useState(20);
  const [searchEmployee, setSearchEmployee] = useState('');
  useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > 300);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Filters
  const [selectedManager, setSelectedManager] = useState<string>('all');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [selectedDivision, setSelectedDivision] = useState<string>('all');
  const [selectedPeriod, setSelectedPeriod] = useState<string>(currentMonth);
  const [selectedYear, setSelectedYear] = useState<string>(currentYear.toString());

  // Fetch distinct periods/years via lightweight query (no full KPI load)
  const { data: distinctPeriods } = useDistinctKpiPeriods();
  const availablePeriods = distinctPeriods?.periods || [];
  const availableYears = distinctPeriods?.years || [];

  // Period-scoped fetch (default) vs all-KPIs fetch (only when "all" selected)
  const isAllPeriods = selectedPeriod === 'all' && selectedYear === 'all';
  const { data: periodKpis, isLoading: periodKpisLoading } = useKpisByPeriod(
    isAllPeriods ? undefined : selectedPeriod === 'all' ? undefined : selectedPeriod,
    isAllPeriods ? undefined : selectedYear === 'all' ? undefined : parseInt(selectedYear),
  );
  const { data: allKpisData, isLoading: allKpisLoading } = useAllKpis({ enabled: isAllPeriods });

  // Use period-scoped data when available, fall back to all
  const kpis = isAllPeriods ? allKpisData : periodKpis;
  const kpisLoading = isAllPeriods ? allKpisLoading : periodKpisLoading;

  const { data: categories } = useKraCategories();
  const { data: profiles, isLoading: profilesLoading } = useProfiles();
  const { data: divisions } = useDivisions();
  const { data: departments } = useDepartments();

  // Lightweight open-query counts (single request instead of ~47 batched)
  const kpiIds = useMemo(() => kpis?.map(k => k.id) || [], [kpis]);
  const { data: openQueryCountByKpi } = useOpenQueryCounts(kpiIds);
  const queryCountMap = openQueryCountByKpi || new Map<string, number>();

  // Fetch org_kpi_values filled status for the selected period/year
  const { data: orgKpiFilledSet } = useQuery({
    queryKey: ['org-kpi-filled-set', selectedPeriod, selectedYear],
    queryFn: async () => {
      // Paginate to avoid the silent 1000-row Supabase ceiling that would
      // otherwise under-report "filled" org KPIs for high-volume periods.
      const filled = new Set<string>();
      const PAGE = 1000;
      let from = 0;
      // Safety cap: 100k rows
      while (from < 100_000) {
        let query = supabase
          .from('org_kpi_values')
          .select('category_id, kra_name, kpi_name, employee_id, achieved_value, is_na')
          .not('employee_id', 'is', null)
          .range(from, from + PAGE - 1);
        if (selectedPeriod !== 'all') query = query.eq('review_period', selectedPeriod);
        if (selectedYear !== 'all') query = query.eq('review_year', parseInt(selectedYear));
        const { data, error } = await query;
        if (error) throw error;
        const rows = data || [];
        for (const row of rows) {
          if (row.achieved_value !== null || row.is_na) {
            filled.add(`${row.category_id}||${row.kra_name}||${row.kpi_name}||${row.employee_id}`);
          }
        }
        if (rows.length < PAGE) break;
        from += PAGE;
      }
      return filled;
    },
    enabled: !!kpis && kpis.length > 0,
    staleTime: 60_000,
  });

  // Dialog states
  const [editingKpi, setEditingKpi] = useState<KPI | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isBulkAssignOpen, setIsBulkAssignOpen] = useState(false);
  const [isCopyKrasOpen, setIsCopyKrasOpen] = useState(false);
  const [expandedEmployees, setExpandedEmployees] = useState<Set<string>>(new Set());
  
  // Admin data entry dialog states
  const [dataEntryKpi, setDataEntryKpi] = useState<KPI | null>(null);
  const [dataEntryEmployee, setDataEntryEmployee] = useState<{ id: string; name: string; code?: string } | null>(null);
  const [dailyEntryKpi, setDailyEntryKpi] = useState<KPI | null>(null);
  const [dailyEntryEmployee, setDailyEntryEmployee] = useState<{ id: string; name: string; code?: string } | null>(null);
  const [deletingKpi, setDeletingKpi] = useState<KPI | null>(null);
  const [stepBackKpi, setStepBackKpi] = useState<KPI | null>(null);
  const [stepBackEmployee, setStepBackEmployee] = useState<{ id: string; name: string } | null>(null);
  const [issuanceEmployee, setIssuanceEmployee] = useState<{ id: string; name: string; code?: string } | null>(null);

  const deleteKpiMutation = useAdminDeleteKpi();

  // Get unique managers (profiles who have reports)
  const managers = useMemo(() => {
    if (!profiles) return [];
    const managerIds = new Set(profiles.filter(p => p.reporting_manager_id).map(p => p.reporting_manager_id));
    return profiles.filter(p => managerIds.has(p.id));
  }, [profiles]);

  const filteredKpis = useMemo(() => {
    if (!kpis) return [];
    
    return kpis.filter(kpi => {
      const employee = kpi.profiles as { id: string; department_id?: string; reporting_manager_id?: string } | null;
      const dept = departments?.find(d => d.id === employee?.department_id);
      
      // Filter by manager
      if (selectedManager !== 'all' && employee?.reporting_manager_id !== selectedManager) {
        return false;
      }
      
      // Filter by department
      if (selectedDepartment !== 'all' && employee?.department_id !== selectedDepartment) {
        return false;
      }
      
      // Filter by division
      if (selectedDivision !== 'all') {
        const deptDivisionId = dept?.business_units?.divisions?.id;
        if (deptDivisionId !== selectedDivision) {
          return false;
        }
      }
      
      // Filter by period (supports non-monthly KPIs like Quarterly, Half-Yearly, etc.)
      if (selectedPeriod !== 'all') {
        if (kpi.review_period === selectedPeriod) {
          // Direct match — keep
        } else {
          // Check if the selected period is a month name and the KPI covers it
          const monthIdx = MONTH_NAMES.indexOf(selectedPeriod as any);
          if (monthIdx !== -1) {
            const coveredMonths = getCalendarMonthsForPeriod(
              kpi.review_period ?? '',
              kpi.frequency ?? null,
              kpi.frequency_cycle_start ?? null,
            );
            if (!coveredMonths.includes(monthIdx)) {
              return false;
            }
          } else {
            return false;
          }
        }
      }
      
      // Filter by year
      if (selectedYear !== 'all' && kpi.review_year?.toString() !== selectedYear) {
        return false;
      }
      
      return true;
    });
  }, [kpis, selectedManager, selectedDepartment, selectedDivision, selectedPeriod, selectedYear, departments]);

  // Build employee data for the matrix table
  const employeeData = useMemo((): EmployeeKpiData[] => {
    if (!filteredKpis || !profiles) return [];

    const employeeMap = new Map<string, EmployeeKpiData>();

    filteredKpis.forEach(kpi => {
      const employee = kpi.profiles as { id: string; full_name?: string; employee_code?: string; department_id?: string; reporting_manager_id?: string } | null;
      if (!employee) return;

      const dept = departments?.find(d => d.id === employee.department_id);
      const manager = profiles.find(p => p.id === employee.reporting_manager_id);

      if (!employeeMap.has(employee.id)) {
        employeeMap.set(employee.id, {
          employeeId: employee.id,
          employeeName: employee.full_name || 'Unknown',
          employeeCode: employee.employee_code || '',
          departmentName: dept?.name || '-',
          managerName: manager?.full_name || '-',
        totalKpis: 0,
          orgLevelKpis: 0,
          orgLevelFilledKpis: 0,
          stageCounts: {},
          stageQueryCounts: {},
          totalWeightage: 0,
        });
      }

      const data = employeeMap.get(employee.id)!;
      data.totalKpis++;
      data.totalWeightage += (kpi.weightage ?? 0);
      if (kpi.is_org_level) {
        data.orgLevelKpis++;
        const filledKey = `${kpi.category_id}||${kpi.kra_name}||${kpi.kpi_name}||${kpi.employee_id}`;
        if (orgKpiFilledSet?.has(filledKey)) {
          data.orgLevelFilledKpis++;
        }
      }

      // Count by stage
      const stage = kpi.status || 'kra_set';
      data.stageCounts[stage] = (data.stageCounts[stage] || 0) + 1;

      // Count queries for this KPI's stage
      const queryCount = queryCountMap.get(kpi.id) || 0;
      if (queryCount > 0) {
        data.stageQueryCounts[stage] = (data.stageQueryCounts[stage] || 0) + queryCount;
      }
    });

    return Array.from(employeeMap.values()).sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  }, [filteredKpis, profiles, departments, queryCountMap, orgKpiFilledSet]);

  // Get KPIs for a specific employee
  const getEmployeeKpis = useCallback((employeeId: string): KPI[] => {
    return filteredKpis
      ?.filter(k => {
        const emp = k.profiles as { id: string } | null;
        return emp?.id === employeeId;
      })
      .sort((a, b) => {
        const kraCompare = (a.kra_name || '').localeCompare(b.kra_name || '');
        if (kraCompare !== 0) return kraCompare;
        return (a.kpi_name || '').localeCompare(b.kpi_name || '');
      }) || [];
  }, [filteredKpis]);

  // Toggle employee expansion
  const toggleEmployeeExpansion = useCallback((employeeId: string) => {
    setExpandedEmployees(prev => {
      const next = new Set(prev);
      if (next.has(employeeId)) {
        next.delete(employeeId);
      } else {
        next.add(employeeId);
      }
      return next;
    });
  }, []);

  // Calculate summary stats
  const stats = useMemo(() => {
    const totalEmployees = employeeData.length;
    const totalKpis = filteredKpis?.length || 0;
    const approvedKpis = filteredKpis?.filter(k => k.status === 'approved').length || 0;
    const completionPercent = totalKpis > 0 ? Math.round((approvedKpis / totalKpis) * 100) : 0;
    const pendingKpis = totalKpis - approvedKpis;
    const totalQueries = Array.from(queryCountMap.values()).reduce((sum, c) => sum + c, 0);

    return {
      totalEmployees,
      totalKpis,
      approvedKpis,
      completionPercent,
      pendingKpis,
      totalQueries,
    };
  }, [employeeData, filteredKpis, queryCountMap]);

  // Check if any filters are active
  const hasActiveFilters = selectedManager !== 'all' || selectedDepartment !== 'all' || 
    selectedDivision !== 'all' || selectedPeriod !== 'all' || selectedYear !== 'all' || searchEmployee.trim() !== '';

  // Filter employeeData by search term
  const displayData = useMemo(() => {
    if (!searchEmployee.trim()) return employeeData;
    const term = searchEmployee.toLowerCase().trim();
    return employeeData.filter(emp =>
      emp.employeeName.toLowerCase().includes(term) ||
      emp.employeeCode.toLowerCase().includes(term)
    );
  }, [employeeData, searchEmployee]);

  const resetFilters = () => {
    setSelectedManager('all');
    setSelectedDepartment('all');
    setSelectedDivision('all');
    setSelectedPeriod('all');
    setSelectedYear('all');
    setSearchEmployee('');
    setVisibleCount(20);
  };

  const { toast } = useToast();

  // Export to Excel
  const handleExportExcel = useCallback(() => {
    if (employeeData.length === 0) {
      toast({ title: 'No data to export', variant: 'destructive' });
      return;
    }

    // Build export data
    const exportData = employeeData.map(emp => {
      const row: Record<string, string | number> = {
        'Employee Name': emp.employeeName,
        'Employee Code': emp.employeeCode,
        'Department': emp.departmentName,
        'Manager': emp.managerName,
        'Total KPIs': emp.totalKpis,
      };

      // Add stage columns with query indicators
      WORKFLOW_STAGES.forEach(stage => {
        const count = emp.stageCounts[stage] || 0;
        const queryCount = emp.stageQueryCounts[stage] || 0;
        const label = getStageLabel(stage);
        row[label] = queryCount > 0 ? `${count} (${queryCount} Query)` : count;
      });

      return row;
    });

    // Create workbook
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'KPI Status');

    // Generate filename with filters
    const filterParts = [];
    if (selectedPeriod !== 'all') filterParts.push(selectedPeriod);
    if (selectedYear !== 'all') filterParts.push(selectedYear);
    const filterSuffix = filterParts.length > 0 ? `_${filterParts.join('_')}` : '';
    const filename = `KPI_Status_Report${filterSuffix}_${new Date().toISOString().split('T')[0]}.xlsx`;

    XLSX.writeFile(wb, filename);
    toast({ title: 'Report downloaded successfully' });
  }, [employeeData, selectedPeriod, selectedYear, toast]);

  const isLoading = kpisLoading || profilesLoading;

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="space-y-2">
          <div className="h-8 w-48 bg-muted animate-pulse rounded" />
          <div className="h-4 w-80 bg-muted animate-pulse rounded" />
        </div>
        <StatsRowSkeleton count={4} />
        <FilterBarSkeleton />
        <TableSkeleton rows={10} columns={8} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Admin KPI Dashboard</h1>
            <p className="text-sm text-muted-foreground">Monitor KPI status across all employees and workflow stages</p>
          </div>
          <Button size="sm" onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Assign KRA
          </Button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ScoringHealthCheck
            kpis={filteredKpis || []}
            selectedPeriod={selectedPeriod}
            selectedYear={selectedYear}
          />
          <div className="h-5 w-px bg-border hidden sm:block" />
          <Button variant="outline" size="sm" onClick={handleExportExcel}>
            <Download className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Export</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setIsCopyKrasOpen(true)}>
            <Copy className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Copy KRAs</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setIsBulkAssignOpen(true)}>
            <Library className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Bulk Assign</span>
          </Button>
        </div>
      </div>

      {/* Summary Widgets */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalEmployees}</div>
            <p className="text-xs text-muted-foreground">With assigned KPIs</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total KPIs</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalKpis}</div>
            <p className="text-xs text-muted-foreground">{stats.approvedKpis} approved, {stats.pendingKpis} pending</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
            <PercentIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.completionPercent}%</div>
            <div className="mt-1 h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary transition-all" 
                style={{ width: `${stats.completionPercent}%` }} 
              />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Open Queries</CardTitle>
            <AlertTriangle className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalQueries}</div>
            <p className="text-xs text-muted-foreground">Requiring attention</p>
          </CardContent>
        </Card>
      </div>

      {/* Compact Filters */}
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">Filters</span>
            {hasActiveFilters && (
              <Badge variant="secondary" className="text-xs">
                {[selectedManager, selectedDepartment, selectedDivision, selectedPeriod, selectedYear].filter(v => v !== 'all').length + (searchEmployee.trim() ? 1 : 0)} active
              </Badge>
            )}
          </div>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={resetFilters} className="h-7 text-xs">
              Reset
            </Button>
          )}
        </div>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search employee by name or code..."
            className="pl-10 h-9"
            value={searchEmployee}
            onChange={(e) => { setSearchEmployee(e.target.value); setVisibleCount(20); }}
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <Select value={selectedManager} onValueChange={setSelectedManager}>
            <SelectTrigger className="h-9">
              <UserCheck className="h-3.5 w-3.5 mr-1.5 text-muted-foreground shrink-0" />
              <SelectValue placeholder="Manager" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Managers</SelectItem>
              {managers.map(manager => (
                <SelectItem key={manager.id} value={manager.id}>
                  {manager.full_name || manager.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
            <SelectTrigger className="h-9">
              <Building2 className="h-3.5 w-3.5 mr-1.5 text-muted-foreground shrink-0" />
              <SelectValue placeholder="Department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {departments?.map(dept => (
                <SelectItem key={dept.id} value={dept.id}>
                  {dept.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedDivision} onValueChange={setSelectedDivision}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Division" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Divisions</SelectItem>
              {divisions?.map(div => (
                <SelectItem key={div.id} value={div.id}>
                  {div.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Periods</SelectItem>
              {availablePeriods.map(period => (
                <SelectItem key={period} value={period}>
                  {period}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Years</SelectItem>
              {availableYears.map(year => (
                <SelectItem key={year} value={year?.toString() || ''}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Employee-Stage Matrix Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">KPI Status by Employee</CardTitle>
          <CardDescription>
            {displayData.length} employees · {stats.totalKpis} total KPIs
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[220px] sticky left-0 bg-background z-10">Employee Name</TableHead>
                  <TableHead className="text-center w-[70px]">Total</TableHead>
                  <TableHead className="text-center w-[70px]">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center gap-1 cursor-help">
                          <Building className="h-3.5 w-3.5" />
                          Org
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Organization-level KPIs with centralized values</TooltipContent>
                    </Tooltip>
                  </TableHead>
                  {WORKFLOW_STAGES.map(stage => (
                    <TableHead key={stage} className="text-center min-w-[90px] px-2">
                      {getStageLabel(stage)}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayData.slice(0, visibleCount).map(emp => {
                  const isExpanded = expandedEmployees.has(emp.employeeId);
                  const employeeKpis = isExpanded ? getEmployeeKpis(emp.employeeId) : [];
                  
                  return (
                    <>
                      <TableRow 
                        key={emp.employeeId} 
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => toggleEmployeeExpansion(emp.employeeId)}
                      >
                        <TableCell className="sticky left-0 bg-background z-10">
                          <div className="flex items-center gap-2">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                            )}
                            <div className="min-w-0">
                              <div className="font-medium truncate">{emp.employeeName}</div>
                              <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                                {emp.employeeCode && <span>{emp.employeeCode}</span>}
                                {emp.employeeCode && <span>·</span>}
                                <span className="truncate max-w-[120px]">{emp.departmentName}</span>
                                {selectedPeriod !== 'all' && (
                                  <>
                                    <span>·</span>
                                    <span className={
                                      emp.totalWeightage > 100
                                        ? 'text-destructive font-medium'
                                        : emp.totalWeightage === 100
                                          ? 'text-green-600 font-medium'
                                          : 'text-amber-600 font-medium'
                                    }>
                                      {emp.totalWeightage}%
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary" className="font-mono">
                            {emp.totalKpis}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {emp.orgLevelKpis > 0 ? (
                            <Badge 
                              variant="outline" 
                              className={`font-mono border-primary/50 ${
                                emp.orgLevelFilledKpis === emp.orgLevelKpis 
                                  ? 'text-green-600 dark:text-green-400 border-green-500/50' 
                                  : emp.orgLevelFilledKpis > 0 
                                    ? 'text-amber-600 dark:text-amber-400 border-amber-500/50' 
                                    : 'text-primary'
                              }`}
                            >
                              {emp.orgLevelFilledKpis}/{emp.orgLevelKpis}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        {WORKFLOW_STAGES.map(stage => {
                          const count = emp.stageCounts[stage] || 0;
                          const queryCount = emp.stageQueryCounts[stage] || 0;
                          
                          if (count === 0) {
                            return (
                              <TableCell key={stage} className="text-center text-muted-foreground px-2">
                                -
                              </TableCell>
                            );
                          }

                          return (
                            <TableCell key={stage} className="text-center px-2">
                              <div className="inline-flex items-center gap-1">
                                <span className="font-medium">{count}</span>
                                {queryCount > 0 && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="inline-flex items-center text-warning cursor-help">
                                        <AlertTriangle className="h-3.5 w-3.5" />
                                        <span className="text-xs ml-0.5">({queryCount})</span>
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {queryCount} open {queryCount === 1 ? 'query' : 'queries'}
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
                            </TableCell>
                          );
                        })}
                      </TableRow>
                      
                      {/* Expanded KPI details */}
                      {isExpanded && employeeKpis.length > 0 && (
                        <TableRow className="bg-muted/30">
                          <TableCell colSpan={3 + WORKFLOW_STAGES.length} className="p-0">
                            <div className="p-4 space-y-2">
                              <div className="flex items-center justify-between mb-3">
                                <div className="text-sm font-medium text-muted-foreground">
                                  Individual KPIs for {emp.employeeName}
                                </div>
                                <div className="flex items-center gap-2">
                                  {employeeKpis.some(k => (k as any).is_issued) ? (
                                    <Badge variant="secondary" className="text-xs">
                                      <CheckCircle className="h-3 w-3 mr-1" />
                                      Issued
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-xs">
                                      Not Issued
                                    </Badge>
                                  )}
                                  <Button
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setIssuanceEmployee({
                                        id: emp.employeeId,
                                        name: emp.employeeName,
                                        code: emp.employeeCode,
                                      });
                                    }}
                                  >
                                    <Send className="h-4 w-4 mr-1" />
                                    Issue KRAs
                                  </Button>
                                </div>
                              </div>
                              <div className="grid gap-2">
                                {employeeKpis.map(kpi => {
                                  const employee = (kpi as any).profiles as { id: string; full_name?: string; employee_code?: string } | null;
                                  const isDaily = kpi.frequency?.toLowerCase() === 'daily';
                                  const isWeekly = kpi.frequency?.toLowerCase() === 'weekly';
                                  
                                  return (
                                    <div 
                                      key={kpi.id}
                                      className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3 p-3 bg-background rounded-lg border hover:border-primary/50 transition-colors"
                                    >
                                      {/* Left: KPI Info */}
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="font-medium">{kpi.kra_name}</span>
                                          {kpi.is_org_level && (
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <Badge variant="outline" className="text-xs border-primary/50 text-primary shrink-0">
                                                  <BuildingIcon className="h-3 w-3 mr-1" />
                                                  Org
                                                </Badge>
                                              </TooltipTrigger>
                                              <TooltipContent>Organization-level KPI with centralized values</TooltipContent>
                                            </Tooltip>
                                          )}
                                          {(isDaily || isWeekly) && (
                                            <Badge variant="secondary" className="text-xs shrink-0">
                                              {kpi.frequency}
                                            </Badge>
                                          )}
                                        </div>
                                        <div className="text-sm text-muted-foreground mt-1 line-clamp-2">{kpi.kpi_name}</div>
                                        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5 flex-wrap">
                                          <span>{kpi.review_period} {kpi.review_year}</span>
                                          <span>·</span>
                                          <span className="truncate max-w-[160px]">{categories?.find(c => c.id === kpi.category_id)?.name || 'Unknown'}</span>
                                          <span>·</span>
                                          <span>{kpi.weightage ?? 0}%</span>
                                        </div>
                                      </div>

                                      {/* Right: Status + Actions */}
                                      <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                                        <Badge variant="outline" className="shrink-0">{getStageLabel(kpi.status || 'kra_set')}</Badge>
                                        
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button 
                                              variant="outline" 
                                              size="icon"
                                              className="h-8 w-8"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setDataEntryKpi(kpi);
                                                setDataEntryEmployee({
                                                  id: employee?.id || '',
                                                  name: employee?.full_name || 'Unknown',
                                                  code: employee?.employee_code,
                                                });
                                              }}
                                            >
                                              <PenLine className="h-3.5 w-3.5" />
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent>Enter Review Data</TooltipContent>
                                        </Tooltip>
                                        
                                        {(isDaily || isWeekly) && (
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Button 
                                                variant="outline" 
                                                size="icon"
                                                className="h-8 w-8"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setDailyEntryKpi(kpi);
                                                  setDailyEntryEmployee({
                                                    id: employee?.id || '',
                                                    name: employee?.full_name || 'Unknown',
                                                    code: employee?.employee_code,
                                                  });
                                                }}
                                              >
                                                <CalendarDays className="h-3.5 w-3.5" />
                                              </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>{isDaily ? 'Enter Daily Data' : 'Enter Weekly Data'}</TooltipContent>
                                          </Tooltip>
                                        )}
                                        
                                        {getPreviousStatus(kpi.status || 'kra_set') && (
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Button 
                                                variant="outline" 
                                                size="icon"
                                                className="h-8 w-8"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setStepBackKpi(kpi);
                                                  setStepBackEmployee({
                                                    id: employee?.id || '',
                                                    name: employee?.full_name || 'Unknown',
                                                  });
                                                }}
                                              >
                                                <Undo2 className="h-3.5 w-3.5" />
                                              </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>Step Back Status</TooltipContent>
                                          </Tooltip>
                                        )}

                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button 
                                              variant="ghost" 
                                              size="icon"
                                              className="h-8 w-8"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setEditingKpi(kpi);
                                              }}
                                            >
                                              <Edit className="h-3.5 w-3.5" />
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent>Edit KPI</TooltipContent>
                                        </Tooltip>
                                        
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button 
                                              variant="ghost" 
                                              size="icon"
                                              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setDeletingKpi(kpi);
                                              }}
                                            >
                                              <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent>Delete KRA</TooltipContent>
                                        </Tooltip>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
                {employeeData.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3 + WORKFLOW_STAGES.length} className="text-center py-8 text-muted-foreground">
                      No employees found matching the selected filters
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {visibleCount < displayData.length && (
            <div className="flex justify-center py-4 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setVisibleCount(prev => prev + 20)}
              >
                Load more ({displayData.length - visibleCount} remaining)
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <AdminKpiEditDialog
        isOpen={!!editingKpi}
        onClose={() => setEditingKpi(null)}
        kpi={editingKpi}
      />

      <AdminKpiCreateDialog
        isOpen={isCreateDialogOpen}
        onClose={() => setIsCreateDialogOpen(false)}
      />

      <BulkTemplateAssignDialog
        isOpen={isBulkAssignOpen}
        onClose={() => setIsBulkAssignOpen(false)}
      />

      {/* Admin Data Entry Dialogs */}
      <AdminDataEntryDialog
        isOpen={!!dataEntryKpi && !!dataEntryEmployee}
        onClose={() => {
          setDataEntryKpi(null);
          setDataEntryEmployee(null);
        }}
        kpi={dataEntryKpi}
        employeeId={dataEntryEmployee?.id || ''}
        employeeName={dataEntryEmployee?.name || ''}
        employeeCode={dataEntryEmployee?.code}
      />

      <AdminDailyEntryDialog
        isOpen={!!dailyEntryKpi && !!dailyEntryEmployee}
        onClose={() => {
          setDailyEntryKpi(null);
          setDailyEntryEmployee(null);
        }}
        kpi={dailyEntryKpi}
        employeeId={dailyEntryEmployee?.id || ''}
        employeeName={dailyEntryEmployee?.name || ''}
        employeeCode={dailyEntryEmployee?.code}
      />

      <CopyKrasDialog
        isOpen={isCopyKrasOpen}
        onClose={() => setIsCopyKrasOpen(false)}
      />

      {/* Admin Status Step Back Dialog */}
      {stepBackKpi && stepBackEmployee && (
        <AdminStatusStepBackDialog
          isOpen={!!stepBackKpi}
          onClose={() => {
            setStepBackKpi(null);
            setStepBackEmployee(null);
          }}
          kpiId={stepBackKpi.id}
          kpiName={stepBackKpi.kpi_name}
          kraName={stepBackKpi.kra_name}
          employeeId={stepBackEmployee.id}
          employeeName={stepBackEmployee.name}
          currentStatus={stepBackKpi.status || 'kra_set'}
          reviewPeriod={stepBackKpi.review_period ?? undefined}
          reviewYear={stepBackKpi.review_year ?? undefined}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingKpi} onOpenChange={(open) => !open && setDeletingKpi(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Assigned KRA</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this KRA? This action cannot be undone.
              <div className="mt-3 p-3 bg-muted rounded-md space-y-1">
                <div className="text-sm font-medium text-foreground">{deletingKpi?.kra_name}</div>
                <div className="text-sm text-muted-foreground">{deletingKpi?.kpi_name}</div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deletingKpi) {
                  deleteKpiMutation.mutate(deletingKpi.id);
                  setDeletingKpi(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* KRA Issuance Confirmation Dialog */}
      {issuanceEmployee && (
        <KraIssuanceConfirmDialog
          isOpen={!!issuanceEmployee}
          onClose={() => setIssuanceEmployee(null)}
          onIssuanceComplete={() => {
            setIssuanceEmployee(null);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          employeeId={issuanceEmployee.id}
          employeeName={issuanceEmployee.name}
          employeeCode={issuanceEmployee.code}
          reviewPeriod={selectedPeriod === 'all' ? '' : selectedPeriod}
          reviewYear={selectedYear === 'all' ? new Date().getFullYear() : parseInt(selectedYear)}
        />
      )}

      {/* Floating scroll-to-top button */}
      {showScrollTop && (
        <Button
          size="icon"
          className="fixed bottom-6 right-6 z-50 rounded-full shadow-lg transition-opacity"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          <ArrowUp className="h-5 w-5" />
        </Button>
      )}
    </div>
  );
}
