import { useState, useMemo, useCallback } from 'react';
import { useAllKpis, useKpiQueries, KPI } from '@/hooks/useKpis';
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
import { Users, Target, AlertTriangle, Plus, PercentIcon, Building2, UserCheck, Download, Building, Library, ChevronDown, ChevronRight, Edit, Building as BuildingIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

// Define the workflow stages for columns
const WORKFLOW_STAGES = ['kra_set', 'self_review', 'manager_check', 'audit', 'management_review', 'approved'];

interface EmployeeKpiData {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  departmentName: string;
  managerName: string;
  totalKpis: number;
  orgLevelKpis: number;
  stageCounts: Record<string, number>;
  stageQueryCounts: Record<string, number>;
}

export default function AllKpis() {
  const { data: kpis, isLoading: kpisLoading } = useAllKpis();
  const { data: categories } = useKraCategories();
  const { data: profiles, isLoading: profilesLoading } = useProfiles();
  const { data: divisions } = useDivisions();
  const { data: departments } = useDepartments();
  // Removed useReviewPeriods - derive periods from KPIs instead

  // Fetch all queries for KPIs
  const kpiIds = useMemo(() => kpis?.map(k => k.id) || [], [kpis]);
  const { data: queries } = useKpiQueries(kpiIds);

  // Filters
  const [selectedManager, setSelectedManager] = useState<string>('all');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [selectedDivision, setSelectedDivision] = useState<string>('all');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<string>('all');

  // Dialog states
  const [editingKpi, setEditingKpi] = useState<KPI | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isBulkAssignOpen, setIsBulkAssignOpen] = useState(false);
  const [expandedEmployees, setExpandedEmployees] = useState<Set<string>>(new Set());

  // Get unique managers (profiles who have reports)
  const managers = useMemo(() => {
    if (!profiles) return [];
    const managerIds = new Set(profiles.filter(p => p.reporting_manager_id).map(p => p.reporting_manager_id));
    return profiles.filter(p => managerIds.has(p.id));
  }, [profiles]);

  // Get unique years from KPIs
  const availableYears = useMemo(() => {
    if (!kpis) return [];
    const years = [...new Set(kpis.map(k => k.review_year).filter(Boolean))];
    return years.sort((a, b) => (b || 0) - (a || 0));
  }, [kpis]);

  // Get unique periods from KPIs directly (ordered by calendar month)
  const availablePeriods = useMemo(() => {
    if (!kpis) return [];
    const monthOrder = ['January', 'February', 'March', 'April', 'May', 'June', 
                        'July', 'August', 'September', 'October', 'November', 'December'];
    const periods = [...new Set(kpis.map(k => k.review_period).filter(Boolean))];
    return periods.sort((a, b) => monthOrder.indexOf(a!) - monthOrder.indexOf(b!));
  }, [kpis]);

  // Create a map of kpi_id to open query count
  const openQueryCountByKpi = useMemo(() => {
    if (!queries) return new Map<string, number>();
    const map = new Map<string, number>();
    queries.forEach(q => {
      if (q.status === 'open') {
        map.set(q.kpi_id, (map.get(q.kpi_id) || 0) + 1);
      }
    });
    return map;
  }, [queries]);

  // Filter KPIs based on selected filters
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
      
      // Filter by period
      if (selectedPeriod !== 'all' && kpi.review_period !== selectedPeriod) {
        return false;
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
          stageCounts: {},
          stageQueryCounts: {},
        });
      }

      const data = employeeMap.get(employee.id)!;
      data.totalKpis++;
      if (kpi.is_org_level) {
        data.orgLevelKpis++;
      }

      // Count by stage
      const stage = kpi.status || 'kra_set';
      data.stageCounts[stage] = (data.stageCounts[stage] || 0) + 1;

      // Count queries for this KPI's stage
      const queryCount = openQueryCountByKpi.get(kpi.id) || 0;
      if (queryCount > 0) {
        data.stageQueryCounts[stage] = (data.stageQueryCounts[stage] || 0) + queryCount;
      }
    });

    return Array.from(employeeMap.values()).sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  }, [filteredKpis, profiles, departments, openQueryCountByKpi]);

  // Get KPIs for a specific employee
  const getEmployeeKpis = useCallback((employeeId: string): KPI[] => {
    return filteredKpis?.filter(k => {
      const emp = k.profiles as { id: string } | null;
      return emp?.id === employeeId;
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
    const totalQueries = Array.from(openQueryCountByKpi.values()).reduce((sum, c) => sum + c, 0);

    return {
      totalEmployees,
      totalKpis,
      approvedKpis,
      completionPercent,
      pendingKpis,
      totalQueries,
    };
  }, [employeeData, filteredKpis, openQueryCountByKpi]);

  // Check if any filters are active
  const hasActiveFilters = selectedManager !== 'all' || selectedDepartment !== 'all' || 
    selectedDivision !== 'all' || selectedPeriod !== 'all' || selectedYear !== 'all';

  const resetFilters = () => {
    setSelectedManager('all');
    setSelectedDepartment('all');
    setSelectedDivision('all');
    setSelectedPeriod('all');
    setSelectedYear('all');
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Admin KPI Dashboard</h1>
          <p className="text-muted-foreground">Monitor KPI status across all employees and workflow stages</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExportExcel}>
            <Download className="h-4 w-4 mr-2" />
            Export Excel
          </Button>
          <Button variant="outline" onClick={() => setIsBulkAssignOpen(true)}>
            <Library className="h-4 w-4 mr-2" />
            Bulk Assign
          </Button>
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Assign KRA
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

      {/* Global Filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Filters</CardTitle>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                Reset
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Reporting Manager */}
            <Select value={selectedManager} onValueChange={setSelectedManager}>
              <SelectTrigger>
                <UserCheck className="h-4 w-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Reporting Manager" />
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

            {/* Department */}
            <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
              <SelectTrigger>
                <Building2 className="h-4 w-4 mr-2 text-muted-foreground" />
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

            {/* Division */}
            <Select value={selectedDivision} onValueChange={setSelectedDivision}>
              <SelectTrigger>
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

            {/* Period */}
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger>
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

            {/* Year */}
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger>
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
        </CardContent>
      </Card>

      {/* Employee-Stage Matrix Table */}
      <Card>
        <CardHeader>
          <CardTitle>KPI Status by Employee</CardTitle>
          <CardDescription>
            {employeeData.length} employees · {stats.totalKpis} total KPIs
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px]">Employee Name</TableHead>
                  <TableHead className="text-center w-[80px]">Total KPIs</TableHead>
                  <TableHead className="text-center w-[80px]">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center gap-1 cursor-help">
                          <Building className="h-3.5 w-3.5" />
                          Org-Level
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Organization-level KPIs with centralized values</TooltipContent>
                    </Tooltip>
                  </TableHead>
                  {WORKFLOW_STAGES.map(stage => (
                    <TableHead key={stage} className="text-center min-w-[100px]">
                      {getStageLabel(stage)}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {employeeData.map(emp => {
                  const isExpanded = expandedEmployees.has(emp.employeeId);
                  const employeeKpis = isExpanded ? getEmployeeKpis(emp.employeeId) : [];
                  
                  return (
                    <>
                      <TableRow 
                        key={emp.employeeId} 
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => toggleEmployeeExpansion(emp.employeeId)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                            <div>
                              <div className="font-medium">{emp.employeeName}</div>
                              <div className="text-xs text-muted-foreground">
                                {emp.employeeCode && <span>{emp.employeeCode} · </span>}
                                {emp.departmentName}
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
                            <Badge variant="outline" className="font-mono text-primary border-primary/50">
                              {emp.orgLevelKpis}
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
                              <TableCell key={stage} className="text-center text-muted-foreground">
                                -
                              </TableCell>
                            );
                          }

                          return (
                            <TableCell key={stage} className="text-center">
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
                              <div className="text-sm font-medium text-muted-foreground mb-3">
                                Individual KPIs for {emp.employeeName}
                              </div>
                              <div className="grid gap-2">
                                {employeeKpis.map(kpi => (
                                  <div 
                                    key={kpi.id}
                                    className="flex items-center justify-between p-3 bg-background rounded-lg border hover:border-primary/50 cursor-pointer transition-colors"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingKpi(kpi);
                                    }}
                                  >
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-medium">{kpi.kra_name}</span>
                                        {kpi.is_org_level && (
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Badge variant="outline" className="text-xs border-primary/50 text-primary shrink-0">
                                                <BuildingIcon className="h-3 w-3 mr-1" />
                                                Org-Level
                                              </Badge>
                                            </TooltipTrigger>
                                            <TooltipContent>Organization-level KPI with centralized values</TooltipContent>
                                          </Tooltip>
                                        )}
                                      </div>
                                      <div className="text-sm text-muted-foreground mt-1">{kpi.kpi_name}</div>
                                      <div className="text-xs text-muted-foreground mt-1">
                                        {kpi.review_period} {kpi.review_year} · {categories?.find(c => c.id === kpi.category_id)?.name || 'Unknown Category'}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0 ml-4">
                                      <Badge variant="outline">{getStageLabel(kpi.status || 'kra_set')}</Badge>
                                      <Button 
                                        variant="ghost" 
                                        size="sm"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setEditingKpi(kpi);
                                        }}
                                      >
                                        <Edit className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                ))}
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
    </div>
  );
}
