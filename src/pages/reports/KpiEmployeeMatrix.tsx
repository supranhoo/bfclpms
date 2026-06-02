import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Download, Search, Target, AlertTriangle, Play, ChevronLeft, ChevronRight, ChevronDown, SlidersHorizontal, EyeOff } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useKpiEmployeeMatrix, useKpiEmployeeMatrixScope, MATRIX_CELL_CAP, type MatrixFilters } from '@/hooks/useKpiEmployeeMatrix';
import { useDepartments, useBusinessUnits, useKraCategories, useDivisions } from '@/hooks/useOrganization';
import { useCompanyFilter } from '@/hooks/useCompanyFilter';
import { CompanyFilter } from '@/components/reports/CompanyFilter';
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';
import { useResolvedReportFields } from '@/hooks/useResolvedReportFields';

const MAT_DEFAULT_FIELDS = [
  { field_key: 'sr_no',          default_label: 'Sr. No.',        default_sort: 10, is_required: true },
  { field_key: 'category',       default_label: 'Category',       default_sort: 20 },
  { field_key: 'kra',            default_label: 'KRA',            default_sort: 30 },
  { field_key: 'kpi',            default_label: 'KPI',            default_sort: 40, is_required: true },
  { field_key: 'weightage',      default_label: 'Weightage',      default_sort: 50 },
  { field_key: 'employee_count', default_label: 'Employee Count', default_sort: 60 },
] as const;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ROW_PAGE_OPTIONS = [25, 50, 100] as const;
const EMP_PAGE_OPTIONS = [25, 50, 100] as const;

// Sticky-pane column widths (px) — single source of truth so left offsets stay aligned.
const COL = {
  sr: 44,
  kpi: 360,
  cell: 64, // employee column width
  headerH: 68,
  rowH: 36,
} as const;
const STICKY_KPI_LEFT = COL.sr;

type ViewMode = 'weightage' | 'score' | 'both';

// 2-letter initials from a full name
function initialsOf(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function KpiEmployeeMatrix() {
  const { toast } = useToast();
  const now = new Date();
  const currentMonth = format(now, 'MMMM');
  const currentYear = now.getFullYear();
  const resolvedMatFields = useResolvedReportFields('RPT-MAT-001', MAT_DEFAULT_FIELDS);

  // Filters state
  const [reviewPeriod, setReviewPeriod] = useState(currentMonth);
  const [reviewYear, setReviewYear] = useState(currentYear);
  const [businessUnitId, setBusinessUnitId] = useState<string>('');
  const [divisionId, setDivisionId] = useState<string>('');
  const [departmentId, setDepartmentId] = useState<string>('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState<number>(50);
  const [loaded, setLoaded] = useState(false);

  // UX state (presentation only)
  const [viewMode, setViewMode] = useState<ViewMode>('score');
  const [hideUnmapped, setHideUnmapped] = useState(true);
  const [empPage, setEmpPage] = useState(0);
  const [empPageSize, setEmpPageSize] = useState<number>(50);
  const [hoverEmpId, setHoverEmpId] = useState<string | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [collapsedKras, setCollapsedKras] = useState<Set<string>>(new Set());
  const filtersRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Force-close any open Radix tooltip when the matrix is scrolled.
  // Radix tooltips occasionally fail to dismiss when the pointer leaves the
  // trigger via fast scroll inside an overflow container — dispatching a
  // pointer/keyboard event clears the open state reliably.
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const close = () => {
      // Only dismiss when an actual Radix tooltip is open — avoids closing
      // unrelated surfaces (sidebar sheet, popovers, dropdowns) on every scroll.
      if (document.querySelector('[data-radix-tooltip-content]')) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      }
    };
    el.addEventListener('scroll', close, { passive: true });
    return () => el.removeEventListener('scroll', close);
  }, [loaded]);

  // Company filter
  const { companies, selectedCompanyId, setSelectedCompanyId, filterByCompany } = useCompanyFilter();

  // Org data
  const { data: departments } = useDepartments();
  const { data: businessUnits } = useBusinessUnits();
  const { data: divisions } = useDivisions();
  const { data: categories } = useKraCategories();

  // Filter departments by selected Division (narrower) or BU
  const filteredDepartments = useMemo(() => {
    if (!departments) return [];
    let list = departments;
    if (divisionId && businessUnits) {
      const buIdsInDiv = new Set(businessUnits.filter(bu => bu.division_id === divisionId).map(bu => bu.id));
      list = list.filter(d => d.business_unit_id && buIdsInDiv.has(d.business_unit_id));
    } else if (businessUnitId) {
      list = list.filter(d => d.business_unit_id === businessUnitId);
    }
    return list;
  }, [departments, businessUnitId, divisionId, businessUnits]);

  // Matrix filters
  const filters: MatrixFilters = useMemo(() => ({
    businessUnitId: businessUnitId || undefined,
    divisionId: divisionId || undefined,
    departmentId: departmentId || undefined,
    categoryId: categoryId || undefined,
    search: search || undefined,
    reviewPeriod,
    reviewYear,
  }), [businessUnitId, divisionId, departmentId, categoryId, search, reviewPeriod, reviewYear]);

  const { data: scope, isLoading: scopeLoading } = useKpiEmployeeMatrixScope(filters);
  const { data, isLoading, isFetching } = useKpiEmployeeMatrix(filters, { enabled: loaded });

  // Company-filter employees
  const filteredEmployees = useMemo(() => {
    if (!data) return [];
    if (selectedCompanyId === 'all') return data.employees;
    return data.employees.filter(e => filterByCompany(e.id));
  }, [data, selectedCompanyId, filterByCompany]);

  const filteredRows = useMemo(() => {
    if (!data) return [];
    if (selectedCompanyId === 'all') return data.rows;
    // Keep only rows that have at least one filtered employee mapped
    const empIds = new Set(filteredEmployees.map(e => e.id));
    return data.rows.map(row => ({
      ...row,
      employeeScores: Object.fromEntries(
        Object.entries(row.employeeScores).filter(([eid]) => empIds.has(eid))
      ),
      employeeWeightages: Object.fromEntries(
        Object.entries(row.employeeWeightages || {}).filter(([eid]) => empIds.has(eid))
      ),
      employeeCount: Object.keys(row.employeeScores).filter(eid => empIds.has(eid)).length,
    }));
  }, [data, selectedCompanyId, filteredEmployees]);

  // Hide-unmapped: keep only employees who appear in at least one filtered row.
  const visibleEmployees = useMemo(() => {
    if (!hideUnmapped) return filteredEmployees;
    const mappedIds = new Set<string>();
    for (const r of filteredRows) {
      for (const eid of Object.keys(r.employeeScores)) mappedIds.add(eid);
    }
    return filteredEmployees.filter(e => mappedIds.has(e.id));
  }, [filteredEmployees, filteredRows, hideUnmapped]);

  // Reset employee paging when the visible set changes
  useEffect(() => { setEmpPage(0); }, [visibleEmployees.length, empPageSize]);

  // KPI row pagination
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / rowsPerPage));
  const pagedRows = filteredRows.slice(page * rowsPerPage, (page + 1) * rowsPerPage);

  // Employee column window
  const empTotalPages = Math.max(1, Math.ceil(visibleEmployees.length / empPageSize));
  const empStart = empPage * empPageSize;
  const empEnd = Math.min(empStart + empPageSize, visibleEmployees.length);
  const empSlice = visibleEmployees.slice(empStart, empEnd);

  // Reset page on filter change
  const handleFilterChange = useCallback((setter: (v: any) => void, value: any) => {
    setter(value);
    setPage(0);
    setEmpPage(0);
    setLoaded(false);
  }, []);

  const scrollToFilters = useCallback(() => {
    filtersRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // Export to Excel
  const exportToExcel = useCallback(() => {
    if (!filteredRows.length || !filteredEmployees.length) {
      toast({ title: 'No data to export', variant: 'destructive' });
      return;
    }

    const headers = ['Sr. No.', 'Category', 'KRA', 'KPI', 'Weightage', 'Employee Count',
      ...filteredEmployees.flatMap(e => [`${e.fullName} (Wt%)`, `${e.fullName} (Score)`])
    ];

    const wsData: any[][] = [headers];
    filteredRows.forEach((row, idx) => {
      const rowData: any[] = [
        idx + 1,
        row.categoryName,
        row.kraName,
        row.kpiName,
        row.weightage,
        row.employeeCount,
      ];
      filteredEmployees.forEach(emp => {
        const wt = row.employeeWeightages[emp.id];
        const score = row.employeeScores[emp.id];
        rowData.push(wt != null ? wt : '');
        rowData.push(score != null ? score : '');
      });
      wsData.push(rowData);
    });

    // Totals row
    const totalsRow: any[] = ['', '', '', 'TOTAL', '', ''];
    filteredEmployees.forEach(emp => {
      let total = 0;
      let hasScore = false;
      filteredRows.forEach(row => {
        const s = row.employeeScores[emp.id];
        if (s != null) { total += s; hasScore = true; }
      });
      totalsRow.push(hasScore ? Math.round(total * 100) / 100 : '');
    });
    wsData.push(totalsRow);

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'KPI-Employee Matrix');

    // Summary sheet
    const summaryData = [
      ['KPI-Employee Weighted Score Matrix'],
      ['Period', `${reviewPeriod} ${reviewYear}`],
      ['Department', departmentId ? departments?.find(d => d.id === departmentId)?.name : 'All'],
      ['Total KPIs', filteredRows.length],
      ['Total Employees', filteredEmployees.length],
      ['Orphan KPIs (0 employees)', filteredRows.filter(r => r.employeeCount === 0).length],
      [],
      ['Employee', 'Code', 'Department', 'KPIs Mapped', 'Total Weighted Score'],
    ];
    filteredEmployees.forEach(emp => {
      let total = 0;
      let count = 0;
      filteredRows.forEach(row => {
        if (row.employeeScores[emp.id] !== undefined) count++;
        const s = row.employeeScores[emp.id];
        if (s != null) total += s;
      });
      summaryData.push([emp.fullName, emp.employeeCode, emp.departmentName, count as any, Math.round(total * 100) / 100 as any]);
    });

    const ws2 = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, ws2, 'Summary');

    XLSX.writeFile(wb, `KPI_Employee_Matrix_${reviewPeriod}_${reviewYear}.xlsx`);
    toast({ title: 'Excel exported successfully' });
  }, [filteredRows, filteredEmployees, reviewPeriod, reviewYear, departmentId, departments, toast]);

  // Summary stats
  const summary = useMemo(() => {
    if (!filteredRows.length) return { totalKpis: 0, totalEmployees: 0, orphanKpis: 0, avgKpisPerEmployee: 0 };
    const orphanKpis = filteredRows.filter(r => r.employeeCount === 0).length;
    const avgKpis = filteredEmployees.length > 0
      ? Math.round(filteredRows.reduce((s, r) => s + r.employeeCount, 0) / filteredEmployees.length * 10) / 10
      : 0;
    return { totalKpis: filteredRows.length, totalEmployees: filteredEmployees.length, orphanKpis, avgKpisPerEmployee: avgKpis };
  }, [filteredRows, filteredEmployees]);

  // Active filter count (drives the "Filters (n)" badge)
  const activeFilterCount = useMemo(() => {
    return [businessUnitId, divisionId, departmentId, categoryId, selectedCompanyId !== 'all' ? selectedCompanyId : '']
      .filter(Boolean).length;
  }, [businessUnitId, divisionId, departmentId, categoryId, selectedCompanyId]);

  return (
    <div className="space-y-3">
      {/* ── Unified sticky toolbar ───────────────────────────────── */}
      <div ref={filtersRef as any} className="sticky top-0 z-40 -mx-1 px-1 pt-1 pb-2 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70 border-b">
        {/* Row A: title + primary controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 mr-auto min-w-0">
            <Button variant="ghost" size="sm" className="h-8 px-2" asChild>
              <a href="/reports"><ChevronLeft className="h-4 w-4" /></a>
            </Button>
            <h1 className="text-base font-semibold truncate">KPI-Employee Matrix</h1>
            <Badge variant="secondary" className="text-[10px] font-normal">
              {reviewPeriod.slice(0, 3)} {reviewYear}
            </Badge>
          </div>

          <div className="relative w-[240px]">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search KPI / Employee…"
              className="pl-7 h-8 text-xs"
              value={search}
              onChange={e => handleFilterChange(setSearch, e.target.value)}
            />
          </div>

          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(v) => v && setViewMode(v as ViewMode)}
            size="sm"
            className="h-8"
          >
            <ToggleGroupItem value="weightage" className="h-8 px-2 text-xs">Wt%</ToggleGroupItem>
            <ToggleGroupItem value="score" className="h-8 px-2 text-xs">Score</ToggleGroupItem>
            <ToggleGroupItem value="both" className="h-8 px-2 text-xs">Both</ToggleGroupItem>
          </ToggleGroup>

          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={hideUnmapped ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setHideUnmapped(v => !v)}
                  aria-label="Hide empty employees"
                >
                  <EyeOff className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{hideUnmapped ? 'Showing only mapped employees' : 'Showing all employees'}</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Filters
                {activeFilterCount > 0 && (
                  <Badge variant="default" className="ml-0.5 h-4 px-1 text-[10px]">{activeFilterCount}</Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[480px] p-3">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Month</Label>
                  <Select value={reviewPeriod} onValueChange={v => handleFilterChange(setReviewPeriod, v)}>
                    <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Year</Label>
                  <Select value={String(reviewYear)} onValueChange={v => handleFilterChange(setReviewYear, Number(v))}>
                    <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 5 }, (_, i) => currentYear - 2 + i).map(y => (
                        <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Company</Label>
                  <div className="mt-1">
                    <CompanyFilter
                      companies={companies}
                      selectedCompanyId={selectedCompanyId}
                      onCompanyChange={setSelectedCompanyId}
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Division</Label>
                  <Select value={divisionId || 'all'} onValueChange={v => {
                    handleFilterChange(setDivisionId, v === 'all' ? '' : v);
                    setBusinessUnitId(''); setDepartmentId('');
                  }}>
                    <SelectTrigger className="h-8 text-xs mt-1"><SelectValue placeholder="Division" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Divisions</SelectItem>
                      {divisions?.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Business Unit</Label>
                  <Select value={businessUnitId || 'all'} onValueChange={v => {
                    handleFilterChange(setBusinessUnitId, v === 'all' ? '' : v); setDepartmentId('');
                  }}>
                    <SelectTrigger className="h-8 text-xs mt-1"><SelectValue placeholder="Business Unit" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Business Units</SelectItem>
                      {(divisionId ? businessUnits?.filter(bu => bu.division_id === divisionId) : businessUnits)?.map(bu => (
                        <SelectItem key={bu.id} value={bu.id}>{bu.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Department</Label>
                  <Select value={departmentId || 'all'} onValueChange={v => handleFilterChange(setDepartmentId, v === 'all' ? '' : v)}>
                    <SelectTrigger className="h-8 text-xs mt-1"><SelectValue placeholder="Department" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Departments</SelectItem>
                      {filteredDepartments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Category</Label>
                  <Select value={categoryId || 'all'} onValueChange={v => handleFilterChange(setCategoryId, v === 'all' ? '' : v)}>
                    <SelectTrigger className="h-8 text-xs mt-1"><SelectValue placeholder="Category" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {categories?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <Button variant="outline" size="sm" className="h-8" onClick={exportToExcel} disabled={!loaded || isLoading || !filteredRows.length}>
            <Download className="h-3.5 w-3.5 mr-1" /> Export
          </Button>
        </div>

        {/* Row B: inline stats + employee pager (only after load) */}
        {loaded && !!filteredRows.length && (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span><span className="font-semibold text-foreground tabular-nums">{summary.totalKpis}</span> KPIs</span>
            <span className="text-muted-foreground/40">·</span>
            <span><span className="font-semibold text-foreground tabular-nums">{summary.totalEmployees}</span> employees</span>
            <span className="text-muted-foreground/40">·</span>
            <span><span className="font-semibold text-foreground tabular-nums">{summary.avgKpisPerEmployee}</span> avg KPIs/emp</span>
            {summary.orphanKpis > 0 && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span className="text-warning"><AlertTriangle className="inline h-3 w-3 mr-0.5" /><span className="font-semibold tabular-nums">{summary.orphanKpis}</span> orphan</span>
              </>
            )}
            <div className="ml-auto flex items-center gap-1.5">
              <span>
                Emp <span className="font-medium text-foreground tabular-nums">{visibleEmployees.length === 0 ? 0 : empStart + 1}–{empEnd}</span> / <span className="tabular-nums">{visibleEmployees.length}</span>
              </span>
              <Button variant="outline" size="icon" className="h-6 w-6" disabled={empPage === 0} onClick={() => setEmpPage(p => Math.max(0, p - 1))}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="icon" className="h-6 w-6" disabled={empPage >= empTotalPages - 1} onClick={() => setEmpPage(p => Math.min(empTotalPages - 1, p + 1))}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
              <Select value={String(empPageSize)} onValueChange={(v) => setEmpPageSize(Number(v))}>
                <SelectTrigger className="h-6 w-[72px] text-[11px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EMP_PAGE_OPTIONS.map(n => <SelectItem key={n} value={String(n)}>{n}/page</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      {/* Click-to-load gate */}
      {!loaded ? (
        <Card>
          <CardContent className="p-8 flex flex-col items-center gap-4 text-center">
            {scopeLoading ? (
              <>
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Estimating scope…</p>
              </>
            ) : scope && scope.employeeCount === 0 ? (
              <p className="text-sm text-muted-foreground">
                No employees have KPIs in <span className="font-medium">{reviewPeriod} {reviewYear}</span> for the selected filters. Adjust filters and try again.
              </p>
            ) : scope?.exceedsCap ? (
              <>
                <AlertTriangle className="h-8 w-8 text-warning" />
                <div>
                  <p className="font-medium">Result set too large</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    ≈ {scope.employeeCount.toLocaleString()} employees · {scope.uniqueKpiCount.toLocaleString()} KPI cells
                    {' '}— exceeds the {MATRIX_CELL_CAP.toLocaleString()}-cell cap.
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Narrow the Division / Business Unit / Department / Category to reduce scope.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={scrollToFilters}>Refine filters</Button>
              </>
            ) : (
              <>
                <Target className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-sm">
                    Ready to load{' '}
                    <span className="font-semibold">{scope?.employeeCount ?? 0}</span> employees ·{' '}
                    <span className="font-semibold">{scope?.uniqueKpiCount ?? 0}</span> KPI cells
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {reviewPeriod} {reviewYear} — click below to fetch the full matrix.
                  </p>
                </div>
                <Button onClick={() => setLoaded(true)} disabled={!scope || scope.employeeCount === 0}>
                  <Play className="h-4 w-4 mr-1" /> Load Matrix
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      ) : isLoading || isFetching ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : data?.exceededCap ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            Result set exceeded the {MATRIX_CELL_CAP.toLocaleString()}-cell cap. Refine your filters and reload.
          </CardContent>
        </Card>
      ) : !filteredRows.length ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            No KPI data found for the selected filters. Try adjusting the department or period.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 min-w-0">
            <TooltipProvider delayDuration={300} disableHoverableContent>
              <div ref={scrollContainerRef} className="w-full max-w-full overflow-auto max-h-[68vh] relative">
                <table className="border-collapse text-[12px] w-full">
                  <colgroup>
                    <col style={{ width: COL.sr }} />
                    <col style={{ width: COL.kpi }} />
                    {empSlice.map(e => <col key={e.id} style={{ width: COL.cell }} />)}
                  </colgroup>
                  <thead className="sticky top-0 z-30">
                    <tr style={{ height: COL.headerH }}>
                      <th className="sticky left-0 z-40 bg-background border-b border-r text-xs font-semibold text-muted-foreground align-bottom pb-2">
                        <div className="text-center">Sr.</div>
                      </th>
                      <th
                        style={{ left: STICKY_KPI_LEFT }}
                        className="sticky z-40 bg-background border-b text-xs font-semibold text-muted-foreground align-bottom pb-2 px-2.5 text-left shadow-[4px_0_8px_-4px_hsl(var(--foreground)/0.12)]"
                      >
                        KPI / KRA
                      </th>
                      {empSlice.map(emp => {
                        const isHover = hoverEmpId === emp.id;
                        return (
                          <th
                            key={emp.id}
                            className={`bg-background border-b align-bottom p-0 ${isHover ? 'bg-accent/30' : ''}`}
                            onMouseEnter={() => setHoverEmpId(emp.id)}
                            onMouseLeave={() => setHoverEmpId(null)}
                          >
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="h-full flex flex-col items-center justify-end gap-1 pb-1.5 px-0.5 cursor-default">
                                  <Avatar className="h-7 w-7 ring-1 ring-border">
                                    <AvatarFallback className="text-[10px] font-semibold bg-primary/10 text-primary">
                                      {initialsOf(emp.fullName)}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="text-[10px] font-medium text-muted-foreground tabular-nums leading-none truncate max-w-full">
                                    {emp.employeeCode || '—'}
                                  </span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" align="center" sideOffset={8} collisionPadding={12} className="z-50">
                                <div className="font-medium">{emp.fullName}</div>
                                {emp.employeeCode && (
                                  <div className="text-xs opacity-80">Code: {emp.employeeCode}</div>
                                )}
                                {emp.departmentName && (
                                  <div className="text-xs opacity-80">{emp.departmentName}</div>
                                )}
                                {emp.designationName && (
                                  <div className="text-xs opacity-80">{emp.designationName}</div>
                                )}
                                {emp.gradeName && (
                                  <div className="text-xs opacity-80">Grade: {emp.gradeName}</div>
                                )}
                              </TooltipContent>
                            </Tooltip>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const elements: JSX.Element[] = [];
                      let lastCat: string | null = null;
                      let lastKra: string | null = null;
                      // Pre-compute category counts within the visible page
                      const catCounts = pagedRows.reduce<Record<string, number>>((acc, r) => {
                        acc[r.categoryName] = (acc[r.categoryName] || 0) + 1;
                        return acc;
                      }, {});
                      // Pre-compute KRA counts within the visible page (scoped by category)
                      const kraCounts = pagedRows.reduce<Record<string, number>>((acc, r) => {
                        const k = `${r.categoryName}|${r.kraName}`;
                        acc[k] = (acc[k] || 0) + 1;
                        return acc;
                      }, {});
                      pagedRows.forEach((row, idx) => {
                        if (row.categoryName !== lastCat) {
                          lastCat = row.categoryName;
                          lastKra = null;
                          const collapsed = collapsedCategories.has(row.categoryName);
                          elements.push(
                            <tr key={`cat-${row.categoryName}`} className="bg-muted">
                              <td
                                colSpan={2 + empSlice.length}
                                style={{ top: COL.headerH }}
                                className="sticky left-0 z-[25] border-b border-border px-2 py-1.5 cursor-pointer hover:bg-muted/90 bg-muted shadow-[0_2px_4px_-2px_hsl(var(--foreground)/0.08)]"
                                onClick={() => {
                                  setCollapsedCategories(prev => {
                                    const next = new Set(prev);
                                    if (next.has(row.categoryName)) next.delete(row.categoryName);
                                    else next.add(row.categoryName);
                                    return next;
                                  });
                                }}
                              >
                                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-foreground">
                                  <ChevronDown
                                    className={`h-3.5 w-3.5 transition-transform ${collapsed ? '-rotate-90' : ''}`}
                                  />
                                  <span>{row.categoryName}</span>
                                  <span className="text-muted-foreground font-normal normal-case tracking-normal">
                                    · {catCounts[row.categoryName]} KPI{catCounts[row.categoryName] === 1 ? '' : 's'}
                                  </span>
                                </div>
                              </td>
                            </tr>
                          );
                        }
                        if (collapsedCategories.has(row.categoryName)) return;
                        // KRA sub-band: shown once per (category, KRA) pair when KRA changes
                        if (row.kraName !== lastKra) {
                          lastKra = row.kraName;
                          const kraKey = `${row.categoryName}|${row.kraName}`;
                          const kraCollapsed = collapsedKras.has(kraKey);
                          elements.push(
                            <tr key={`kra-${kraKey}`} className="bg-background">
                              <td
                                colSpan={2 + empSlice.length}
                                className="sticky left-0 z-20 border-b border-border px-2.5 py-1 cursor-pointer hover:bg-muted/60 bg-muted/95"
                                onClick={() => {
                                  setCollapsedKras(prev => {
                                    const next = new Set(prev);
                                    if (next.has(kraKey)) next.delete(kraKey);
                                    else next.add(kraKey);
                                    return next;
                                  });
                                }}
                              >
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="flex items-center gap-2 text-[11px] font-medium text-foreground pl-4 truncate" style={{ maxWidth: COL.sr + COL.kpi - 8 }}>
                                      <ChevronDown
                                        className={`h-3 w-3 transition-transform text-muted-foreground ${kraCollapsed ? '-rotate-90' : ''}`}
                                      />
                                      <span className="text-primary">KRA:</span>
                                      <span className="truncate">{row.kraName}</span>
                                      <span className="text-muted-foreground font-normal shrink-0">
                                        · {kraCounts[kraKey]} KPI{kraCounts[kraKey] === 1 ? '' : 's'}
                                      </span>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent side="right" align="start" sideOffset={8} collisionPadding={12} className="max-w-md z-50">
                                    <div className="font-medium">{row.kraName}</div>
                                    <div className="text-xs opacity-80 mt-1">Category: {row.categoryName}</div>
                                    <div className="text-xs opacity-80">{kraCounts[kraKey]} KPI{kraCounts[kraKey] === 1 ? '' : 's'} in this page</div>
                                    <div className="text-[10px] opacity-60 mt-1">Click to {kraCollapsed ? 'expand' : 'collapse'}</div>
                                  </TooltipContent>
                                </Tooltip>
                              </td>
                            </tr>
                          );
                        }
                        if (collapsedKras.has(`${row.categoryName}|${row.kraName}`)) return;
                      const isEven = idx % 2 === 1;
                      const rowBg = isEven ? 'bg-muted/20' : 'bg-background';
                      elements.push(
                        <tr key={row.key} className="group hover:bg-accent/20">
                          <td className={`sticky left-0 z-20 border-b border-r text-center text-xs text-muted-foreground ${rowBg} group-hover:bg-accent/20`}>
                            {page * rowsPerPage + idx + 1}
                          </td>
                          <td
                            style={{ left: STICKY_KPI_LEFT }}
                            className={`sticky z-20 border-b px-2.5 ${rowBg} group-hover:bg-accent/20 shadow-[4px_0_8px_-4px_hsl(var(--foreground)/0.12)]`}
                          >
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="cursor-default py-1.5 pl-7 pr-1" style={{ width: COL.kpi - 4 }}>
                                  <div className="flex items-baseline gap-1.5">
                                    <span className="font-medium text-foreground leading-snug text-xs line-clamp-2 break-words">{row.kpiName}</span>
                                    <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums ml-auto">{row.weightage}%</span>
                                  </div>
                                  {row.description && (
                                    <div className="text-[10px] text-muted-foreground leading-snug mt-0.5 line-clamp-2 break-words whitespace-normal">
                                      {row.description}
                                    </div>
                                  )}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="right" align="start" sideOffset={8} collisionPadding={12} className="max-w-md z-50">
                                <div className="font-medium">{row.kpiName}</div>
                                <div className="text-xs opacity-80 mt-1">KRA: {row.kraName}</div>
                                <div className="text-xs opacity-80">Category: {row.categoryName}</div>
                                <div className="text-xs opacity-80">Base Weightage: {row.weightage}%</div>
                                {row.description && (
                                  <div className="text-xs opacity-80 mt-1 whitespace-pre-wrap">{row.description}</div>
                                )}
                              </TooltipContent>
                            </Tooltip>
                          </td>
                          {empSlice.map(emp => {
                            const score = row.employeeScores[emp.id];
                            const wt = row.employeeWeightages[emp.id];
                            const isMapped = emp.id in row.employeeScores;
                            const isColHover = hoverEmpId === emp.id;
                            const cov = (score != null && wt) ? Math.max(0, Math.min(1, score / (wt as number))) : 0;
                            // Accessible tint based on coverage ratio
                            const tint = score == null || !wt
                              ? ''
                              : cov >= 0.8
                                ? 'bg-emerald-500/10'
                                : cov < 0.4
                                  ? 'bg-amber-500/10'
                                  : '';
                            return (
                              <td
                                key={emp.id}
                                onMouseEnter={() => setHoverEmpId(emp.id)}
                                onMouseLeave={() => setHoverEmpId(null)}
                                className={`relative border-b text-center align-middle ${tint} ${isColHover ? 'bg-accent/30' : ''}`}
                              >
                                {isMapped ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="relative w-full h-full cursor-default">
                                        {score != null && cov > 0 && (
                                          <div
                                            aria-hidden
                                            className="absolute inset-y-1 left-1 rounded-sm bg-primary/10 pointer-events-none"
                                            style={{ width: `calc(${cov * 100}% - 8px)` }}
                                          />
                                        )}
                                        {!isColHover && score == null && (
                                          <div
                                            aria-hidden
                                            className="absolute inset-1 pointer-events-none opacity-40"
                                            style={{
                                              backgroundImage: 'radial-gradient(circle, hsl(var(--muted-foreground)) 0.5px, transparent 0.5px)',
                                              backgroundSize: '4px 4px',
                                            }}
                                          />
                                        )}
                                        <div className="relative font-medium leading-tight py-1.5 tabular-nums">
                                          {viewMode === 'weightage' && (
                                            <span>{wt != null ? `${wt}%` : '—'}</span>
                                          )}
                                          {viewMode === 'score' && (
                                            <span className={score == null ? 'text-muted-foreground/60' : ''}>
                                              {score != null ? score : '·'}
                                            </span>
                                          )}
                                          {viewMode === 'both' && (
                                            <div className="flex flex-col items-center leading-none">
                                              <span className="text-[11px]">{score != null ? score : '·'}</span>
                                              <span className="text-[9px] text-muted-foreground">{wt != null ? `${wt}%` : ''}</span>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <div className="font-medium">{emp.fullName}</div>
                                      <div className="text-xs opacity-80 mt-1 truncate max-w-[260px]">{row.kpiName}</div>
                                      <div className="text-xs opacity-80">Weightage: {wt != null ? `${wt}%` : '—'}</div>
                                      <div className="text-xs opacity-80">Weighted Score: {score != null ? score : '—'}</div>
                                    </TooltipContent>
                                  </Tooltip>
                                ) : (
                                  <span className="text-muted-foreground/30">·</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                      });
                      return elements;
                    })()}
                  </tbody>
                </table>
              </div>
            </TooltipProvider>

            {/* Pagination */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t">
              <p className="text-sm text-muted-foreground">
                Showing <span className="font-medium text-foreground">{page * rowsPerPage + 1}–{Math.min((page + 1) * rowsPerPage, filteredRows.length)}</span> of{' '}
                <span className="font-medium text-foreground">{filteredRows.length}</span> KPIs
              </p>
              <div className="flex items-center gap-2">
                <Select value={String(rowsPerPage)} onValueChange={(v) => { setRowsPerPage(Number(v)); setPage(0); }}>
                  <SelectTrigger className="h-8 w-[90px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROW_PAGE_OPTIONS.map(n => <SelectItem key={n} value={String(n)}>{n}/page</SelectItem>)}
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground px-1">
                  Page {page + 1} of {totalPages}
                </span>
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
