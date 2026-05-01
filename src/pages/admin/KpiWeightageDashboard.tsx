import React, { useState, useMemo, useEffect, useRef } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, ChevronRight, ChevronLeft, Download, Search, AlertTriangle, CheckCircle2, Pencil, Plus, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  useKpiWeightageMatrix,
  useWeightageVarianceSummary,
  WEIGHTAGE_PAGE_SIZE_OPTIONS,
  WEIGHTAGE_DEFAULT_PAGE_SIZE,
  type EmployeeMatrix,
} from '@/hooks/useKpiWeightageMatrix';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { WeightageCellEditor } from '@/components/admin/WeightageCellEditor';
import { AcknowledgeVariancePopover } from '@/components/admin/AcknowledgeVariancePopover';
import { AdminKpiEditDialog } from '@/components/admin/AdminKpiEditDialog';
import { KPI } from '@/hooks/useKpis';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

const SHORT_MONTHS: Record<string, string> = {
  January: 'Jan', February: 'Feb', March: 'Mar', April: 'Apr',
  May: 'May', June: 'Jun', July: 'Jul', August: 'Aug',
  September: 'Sep', October: 'Oct', November: 'Nov', December: 'Dec',
};

function KpiWeightageDashboard() {
  const queryClient = useQueryClient();
  const now = new Date();
  const currentFiscalYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  const [fiscalYear, setFiscalYear] = useState(currentFiscalYear);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [departmentId, setDepartmentId] = useState<string>('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [showInactive, setShowInactive] = useState(false);
  const [showOnlyUnacknowledged, setShowOnlyUnacknowledged] = useState(false);
  const [openEmployees, setOpenEmployees] = useState<Set<string>>(new Set());
  const [editingKpi, setEditingKpi] = useState<KPI | null>(null);
  const [loadingEditKpi, setLoadingEditKpi] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(WEIGHTAGE_DEFAULT_PAGE_SIZE);

  // Debounce free-text search to avoid hammering the DB on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(employeeSearch.trim()), 300);
    return () => clearTimeout(t);
  }, [employeeSearch]);

  // Reset to page 1 whenever any filter changes.
  useEffect(() => {
    setPage(1);
  }, [fiscalYear, debouncedSearch, departmentId, categoryId, showInactive, pageSize]);

  const handleEditKpi = async (kpiId: string) => {
    setLoadingEditKpi(true);
    try {
      const { data, error } = await supabase.from('kpis').select('*').eq('id', kpiId).single();
      if (error) throw error;
      setEditingKpi(data as unknown as KPI);
    } catch (err: any) {
      toast.error('Failed to load KPI details');
    } finally {
      setLoadingEditKpi(false);
    }
  };

  const fiscalLabel = (y: number) => `${y}-${String(y + 1).slice(-2)}`;

  const filterArgs = {
    employeeSearch: debouncedSearch || undefined,
    departmentId: departmentId && departmentId !== 'all' ? departmentId : undefined,
    categoryId: categoryId && categoryId !== 'all' ? categoryId : undefined,
    includeInactive: showInactive,
  };

  const { data, isLoading } = useKpiWeightageMatrix(fiscalYear, filterArgs, { page, pageSize });
  const { data: summary } = useWeightageVarianceSummary(fiscalYear, filterArgs);

  const { data: departments } = useQuery({
    queryKey: ['departments-list'],
    queryFn: async () => {
      const { data } = await supabase.from('departments').select('id, name').order('name');
      return data || [];
    },
  });

  const { data: categories } = useQuery({
    queryKey: ['kra-categories-list'],
    queryFn: async () => {
      const { data } = await supabase.from('kra_categories').select('id, name').order('name');
      return data || [];
    },
  });

  const employees = data?.employees || [];
  const globalMonths = data?.globalActiveMonths || [];
  const totalEmployees = summary?.totalEmployees ?? data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalEmployees / pageSize));

  const toggleEmployee = (id: string) => {
    setOpenEmployees(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const expandAll = () => setOpenEmployees(new Set(employees.map(e => e.employeeId)));
  const collapseAll = () => setOpenEmployees(new Set());

  // Aggregate across the FULL filter set (not just the current page).
  const varianceCount = summary?.varianceCount ?? 0;
  const acknowledgedCount = summary?.acknowledgedCount ?? 0;

  const totalMismatchCount = varianceCount + acknowledgedCount;
  const prevVarianceRef = useRef(varianceCount);
  useEffect(() => {
    const timer = setTimeout(() => { prevVarianceRef.current = varianceCount; }, 600);
    return () => clearTimeout(timer);
  }, [varianceCount]);

  const handleExport = () => {
    const rows: any[] = [];
    for (const emp of employees) {
      const sortedKras = Object.keys(emp.kras).sort();
      for (const kraName of sortedKras) {
        for (const kpi of emp.kras[kraName]) {
          const row: any = {
            'Employee': emp.fullName,
            'Employee Code': emp.employeeCode,
            'Department': emp.departmentName,
            'KRA': kraName,
            'KPI': kpi.kpiName,
            'Category': kpi.categoryName,
          };
          for (const m of globalMonths) {
            row[SHORT_MONTHS[m] || m] = kpi.months[m] != null ? `${kpi.months[m]}%` : '--';
          }
          row['Variance'] = kpi.hasMismatch ? (kpi.isAcknowledged ? 'Acknowledged' : 'Yes') : 'No';
          rows.push(row);
        }
      }
      // Add totals row
      const totalRow: any = {
        'Employee': emp.fullName,
        'Employee Code': emp.employeeCode,
        'Department': emp.departmentName,
        'KRA': '** TOTAL **',
        'KPI': '',
        'Category': '',
      };
      for (const m of globalMonths) {
        totalRow[SHORT_MONTHS[m] || m] = emp.monthTotals[m] != null ? `${emp.monthTotals[m]}%` : '--';
      }
      totalRow['Variance'] = '';
      rows.push(totalRow);
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Weightage Matrix');
    XLSX.writeFile(wb, `KPI_Weightage_Matrix_${fiscalLabel(fiscalYear)}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="KPI Weightage Dashboard" description="View KRA/KPI weightage distribution across months for all employees" />

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Assessment Year</label>
              <Select value={String(fiscalYear)} onValueChange={v => setFiscalYear(Number(v))}>
                <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[currentFiscalYear - 1, currentFiscalYear, currentFiscalYear + 1].map(y => (
                    <SelectItem key={y} value={String(y)}>{fiscalLabel(y)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 flex-1 min-w-[200px]">
              <label className="text-xs font-medium text-muted-foreground">Employee</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or code..."
                  value={employeeSearch}
                  onChange={e => setEmployeeSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Department</label>
              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {departments?.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Category</label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories?.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 self-end pb-1">
              <Switch id="show-inactive" checked={showInactive} onCheckedChange={setShowInactive} />
              <Label htmlFor="show-inactive" className="text-xs text-muted-foreground whitespace-nowrap cursor-pointer">Show Inactive</Label>
            </div>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={!employees.length}>
              <Download className="h-4 w-4 mr-1.5" />Export
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="flex gap-3 flex-wrap items-center">
        <Badge variant="secondary" className="text-sm py-1 px-3">
          {totalEmployees} Employees
        </Badge>
        {varianceCount > 0 ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="destructive"
                  className={`text-sm py-1 px-3 transition-all duration-300 ${varianceCount !== prevVarianceRef.current ? 'ring-2 ring-primary ring-offset-2 ring-offset-background scale-105' : ''}`}
                >
                  <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                  {varianceCount} Variances
                  <Info className="h-3 w-3 ml-1 opacity-60" />
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[280px] text-xs">
                {varianceCount} KPIs have unacknowledged weightage differences across months. Click the ⚠ icon on a KPI row to mark it as intentional, or edit &amp; apply "All months" to fix.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : totalMismatchCount === 0 ? (
          <Badge variant="secondary" className="text-sm py-1 px-3">
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
            All Clear
          </Badge>
        ) : null}
        {acknowledgedCount > 0 && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="text-sm py-1 px-3 border-amber-500/50 text-amber-600 dark:text-amber-400">
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                  {acknowledgedCount} Acknowledged
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[260px] text-xs">
                {acknowledgedCount} KPIs have intentional weightage variations confirmed by admin.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        <div className="flex items-center gap-2 ml-2">
          <Switch id="show-unack" checked={showOnlyUnacknowledged} onCheckedChange={setShowOnlyUnacknowledged} />
          <Label htmlFor="show-unack" className="text-xs text-muted-foreground whitespace-nowrap cursor-pointer">Unacknowledged only</Label>
        </div>
        {employees.length > 0 && (
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" size="sm" onClick={expandAll}>Expand All</Button>
            <Button variant="ghost" size="sm" onClick={collapseAll}>Collapse All</Button>
          </div>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}

      {/* Empty */}
      {!isLoading && employees.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No KPI data found for {fiscalLabel(fiscalYear)}.
          </CardContent>
        </Card>
      )}

      {/* Employee Sections */}
      {employees.map(emp => (
        <EmployeeSection
          key={emp.employeeId}
          employee={emp}
          months={globalMonths}
          isOpen={openEmployees.has(emp.employeeId)}
          onToggle={() => toggleEmployee(emp.employeeId)}
          onWeightageUpdate={() => queryClient.invalidateQueries({ queryKey: ['kpi-weightage-matrix'] })}
          fiscalYear={fiscalYear}
          onEditKpi={handleEditKpi}
          showOnlyUnacknowledged={showOnlyUnacknowledged}
        />
      ))}

      {/* Pagination footer */}
      {totalEmployees > 0 && (
        <Card>
          <CardContent className="py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              Page {page} of {totalPages} · {totalEmployees} employees
              <span className="ml-2 italic">(current page only)</span>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="ps" className="text-xs text-muted-foreground">Per page</Label>
              <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                <SelectTrigger id="ps" className="h-8 w-[80px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WEIGHTAGE_PAGE_SIZE_OPTIONS.map((n) => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || isLoading}
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || isLoading}
              >
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <AdminKpiEditDialog
        isOpen={!!editingKpi}
        onClose={() => {
          setEditingKpi(null);
          queryClient.invalidateQueries({ queryKey: ['kpi-weightage-matrix'] });
        }}
        kpi={editingKpi}
      />
    </div>
  );
}

const FISCAL_MONTHS = ['July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March', 'April', 'May', 'June'];

function getReviewYearForMonth(month: string, fiscalStartYear: number): number {
  const idx = FISCAL_MONTHS.indexOf(month);
  return idx < 6 ? fiscalStartYear : fiscalStartYear + 1;
}

function EmployeeSection({ employee, months, isOpen, onToggle, onWeightageUpdate, fiscalYear, onEditKpi, showOnlyUnacknowledged }: {
  employee: EmployeeMatrix;
  months: string[];
  isOpen: boolean;
  onToggle: () => void;
  onWeightageUpdate: () => void;
  fiscalYear: number;
  onEditKpi: (kpiId: string) => void;
  showOnlyUnacknowledged: boolean;
}) {
  const [addingCell, setAddingCell] = useState<string | null>(null);
  const sortedKras = Object.keys(employee.kras).sort();
  const hasUnacknowledgedMismatches = sortedKras.some(kra => employee.kras[kra].some(k => k.hasMismatch && !k.isAcknowledged));
  const hasMismatches = sortedKras.some(kra => employee.kras[kra].some(k => k.hasMismatch));
  const totalMismatch = months.some(m => {
    const total = employee.monthTotals[m];
    return total != null && total !== 100;
  });

  const handleAddKpiToMonth = async (kpiRow: { kpiName: string; kraName: string; kpiIds: Record<string, string>; categoryId: string }, month: string) => {
    const cellKey = `${kpiRow.kraName}|${kpiRow.kpiName}|${month}`;
    setAddingCell(cellKey);
    try {
      // Find a source KPI to duplicate from
      const sourceMonth = Object.keys(kpiRow.kpiIds).find(m => kpiRow.kpiIds[m]);
      if (!sourceMonth) {
        toast.error('No source KPI found to duplicate');
        return;
      }
      const sourceKpiId = kpiRow.kpiIds[sourceMonth];

      // Fetch the source KPI
      const { data: sourceKpi, error: fetchError } = await supabase
        .from('kpis')
        .select('*')
        .eq('id', sourceKpiId)
        .single();
      if (fetchError || !sourceKpi) {
        toast.error('Failed to fetch source KPI');
        return;
      }

      const reviewYear = getReviewYearForMonth(month, fiscalYear);

      // Insert the new KPI for the target month
      const { id, created_at, updated_at, ...rest } = sourceKpi;
      const insertPayload = {
        ...rest,
        review_period: month,
        review_year: reviewYear,
        status: 'kra_set' as const,
      };

      const { error: insertError } = await supabase.from('kpis').insert(insertPayload as any);
      if (insertError) {
        if (insertError.message?.includes('duplicate') || insertError.code === '23505') {
          toast.error('KPI already exists for this month');
        } else {
          toast.error(insertError.message || 'Failed to add KPI');
        }
        return;
      }

      // Ensure review_period record exists
      await supabase.from('review_periods').upsert(
        { period_name: month, review_year: reviewYear, is_locked: false },
        { onConflict: 'period_name,review_year' }
      );

      toast.success(`KPI added for ${month}`);
      onWeightageUpdate();
    } catch (err: any) {
      toast.error(err.message || 'Failed to add KPI');
    } finally {
      setAddingCell(null);
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={onToggle}>
      <Card className={hasUnacknowledgedMismatches ? 'border-destructive/30' : hasMismatches ? 'border-amber-500/30' : ''}>
        <CollapsibleTrigger asChild>
          <button className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/50 transition-colors rounded-t-lg">
            <div className="flex items-center gap-3">
              <ChevronRight className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
              <div className="text-left">
                <span className="font-medium">{employee.fullName}</span>
                <span className="text-muted-foreground ml-2 text-sm">({employee.employeeCode})</span>
                <span className="text-muted-foreground ml-2 text-xs">• {employee.departmentName}</span>
              </div>
              {hasUnacknowledgedMismatches && <Badge variant="destructive" className="text-xs">Variance</Badge>}
              {!hasUnacknowledgedMismatches && hasMismatches && <Badge variant="outline" className="text-xs border-amber-500/50 text-amber-600 dark:text-amber-400">Acknowledged</Badge>}
              {!employee.isActive && <Badge variant="outline" className="text-xs text-muted-foreground">Inactive</Badge>}
            </div>
            <div className="flex gap-2 flex-wrap justify-end">
              {months.map(m => {
                const total = employee.monthTotals[m];
                if (total == null) return null;
                const isOk = total === 100;
                return (
                  <span
                    key={m}
                    className={`text-xs px-1.5 py-0.5 rounded ${
                      isOk ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive'
                    }`}
                  >
                    {SHORT_MONTHS[m]}: {total}%
                  </span>
                );
              })}
            </div>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="max-w-[200px] sticky left-0 bg-background z-10">KRA / KPI</TableHead>
                  {months.map(m => (
                    <TableHead key={m} className="text-center min-w-[55px]">{SHORT_MONTHS[m]}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedKras.map(kraName => (
                  <React.Fragment key={kraName}>
                    <TableRow key={`kra-${kraName}`} className="bg-muted/30">
                      <TableCell colSpan={months.length + 1} className="font-medium text-sm py-2">
                        {kraName}
                      </TableCell>
                    </TableRow>
                    {employee.kras[kraName]
                      .filter(kpi => !showOnlyUnacknowledged || (kpi.hasMismatch && !kpi.isAcknowledged))
                      .map(kpi => {
                      const firstKpiId = Object.values(kpi.kpiIds).find(Boolean);
                      return (
                      <TableRow key={`kpi-${kpi.kpiName}-${kraName}`} className="group/kpirow">
                        <TableCell className="pl-8 text-sm sticky left-0 bg-background z-10 max-w-[200px]">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate" title={kpi.kpiName}>{kpi.kpiName}</span>
                            {kpi.hasMismatch && (
                              <AcknowledgeVariancePopover
                                isAcknowledged={kpi.isAcknowledged}
                                kpiIds={kpi.kpiIds}
                                kpiName={kpi.kpiName}
                                onSuccess={onWeightageUpdate}
                              />
                            )}
                            {firstKpiId && (
                              <button
                                onClick={() => onEditKpi(firstKpiId)}
                                className="opacity-50 hover:opacity-100 focus:opacity-100 p-0.5 rounded hover:bg-muted transition-all shrink-0"
                                title="Edit KPI"
                              >
                                <Pencil className="h-3 w-3 text-muted-foreground" />
                              </button>
                            )}
                          </div>
                        </TableCell>
                        {months.map((m, mIdx) => {
                          const w = kpi.months[m];
                          const isMismatch = w != null && kpi.baselineWeightage != null && w !== kpi.baselineWeightage;
                          const noData = w == null;
                          const isEliminated = noData && months.slice(0, mIdx).some(prev => kpi.months[prev] != null);
                          const hasKpiId = !!kpi.kpiIds[m];
                          const cellContent = noData ? '--' : `${w}%`;
                          const hasOtherMonths = Object.keys(kpi.kpiIds).length > 0;
                          const cellKey = `${kpi.kraName}|${kpi.kpiName}|${m}`;
                          const isAdding = addingCell === cellKey;
                          const cellClasses = `text-center text-sm ${
                            isEliminated
                              ? 'bg-destructive/10 text-destructive font-medium'
                              : noData
                                ? 'text-muted-foreground/40'
                                : isMismatch
                                  ? 'bg-destructive/10 text-destructive font-medium'
                                  : ''
                          }`;

                          if (hasKpiId) {
                            return (
                              <TableCell key={m} className={cellClasses}>
                                <WeightageCellEditor
                                  employeeId={employee.employeeId}
                                  kraName={kpi.kraName || kraName}
                                  kpiName={kpi.kpiName}
                                  month={m}
                                  currentWeightage={w}
                                  kpiIds={kpi.kpiIds}
                                  onSuccess={onWeightageUpdate}
                                >
                                  <button
                                    className="w-full cursor-pointer hover:bg-muted/60 rounded px-1 py-0.5 transition-colors group inline-flex items-center justify-center gap-0.5"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {cellContent}
                                    <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity shrink-0" />
                                  </button>
                                </WeightageCellEditor>
                              </TableCell>
                            );
                          }

                          // Empty cell — show "+" to add KPI for this month
                          if (hasOtherMonths && !hasKpiId) {
                            return (
                              <TableCell key={m} className={cellClasses}>
                                <button
                                  className="w-full h-full inline-flex items-center justify-center cursor-pointer hover:bg-muted/60 rounded px-1 py-0.5 transition-colors group"
                                  onClick={() => handleAddKpiToMonth(kpi, m)}
                                  disabled={isAdding}
                                  title={`Add KPI for ${m}`}
                                >
                                  {isAdding ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                                  ) : (
                                    <Plus className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                                  )}
                                </button>
                              </TableCell>
                            );
                          }

                          return (
                            <TableCell key={m} className={cellClasses}>
                              {cellContent}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                      );
                    })}
                  </React.Fragment>
                ))}
                {/* Totals row */}
                <TableRow className="bg-muted/50 font-medium">
                  <TableCell className="sticky left-0 bg-muted/50 z-10 text-sm">Total Weightage</TableCell>
                  {months.map(m => {
                    const total = employee.monthTotals[m];
                    const isOk = total === 100;
                    return (
                      <TableCell
                        key={m}
                        className={`text-center text-sm ${
                          total == null ? 'text-muted-foreground/40' :
                          isOk ? 'text-primary' : 'text-destructive font-bold'
                        }`}
                      >
                        {total != null ? `${total}%` : '--'}
                      </TableCell>
                    );
                  })}
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export default KpiWeightageDashboard;
