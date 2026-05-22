import { useState, useMemo, useCallback } from 'react';
import { format } from 'date-fns';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Download, Search, Users, Target, AlertTriangle, BarChart3, Play } from 'lucide-react';
import { useKpiEmployeeMatrix, useKpiEmployeeMatrixScope, MATRIX_CELL_CAP, type MatrixFilters } from '@/hooks/useKpiEmployeeMatrix';
import { useDepartments, useBusinessUnits, useKraCategories, useDivisions } from '@/hooks/useOrganization';
import { useCompanyFilter } from '@/hooks/useCompanyFilter';
import { CompanyFilter } from '@/components/reports/CompanyFilter';
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ROWS_PER_PAGE = 50;

export default function KpiEmployeeMatrix() {
  const { toast } = useToast();
  const now = new Date();
  const currentMonth = format(now, 'MMMM');
  const currentYear = now.getFullYear();

  // Filters state
  const [reviewPeriod, setReviewPeriod] = useState(currentMonth);
  const [reviewYear, setReviewYear] = useState(currentYear);
  const [businessUnitId, setBusinessUnitId] = useState<string>('');
  const [divisionId, setDivisionId] = useState<string>('');
  const [departmentId, setDepartmentId] = useState<string>('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [loaded, setLoaded] = useState(false);

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

  // Pagination
  const totalPages = Math.ceil(filteredRows.length / ROWS_PER_PAGE);
  const pagedRows = filteredRows.slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE);

  // Reset page on filter change
  const handleFilterChange = useCallback((setter: (v: any) => void, value: any) => {
    setter(value);
    setPage(0);
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

  return (
    <div className="space-y-4">
      <PageHeader
        title="KPI-Employee Weighted Score Matrix"
        description="Cross-tab view of KPIs vs Employees with weighted scores — useful for role planning and KPI flow analysis"
        backTo="/reports"
      />

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
            <CompanyFilter
              companies={companies}
              selectedCompanyId={selectedCompanyId}
              onCompanyChange={setSelectedCompanyId}
            />

            <Select value={reviewPeriod} onValueChange={v => handleFilterChange(setReviewPeriod, v)}>
              <SelectTrigger><SelectValue placeholder="Month" /></SelectTrigger>
              <SelectContent>
                {MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={String(reviewYear)} onValueChange={v => handleFilterChange(setReviewYear, Number(v))}>
              <SelectTrigger><SelectValue placeholder="Year" /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 5 }, (_, i) => currentYear - 2 + i).map(y => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={divisionId || 'all'} onValueChange={v => {
              handleFilterChange(setDivisionId, v === 'all' ? '' : v);
              setBusinessUnitId('');
              setDepartmentId('');
            }}>
              <SelectTrigger><SelectValue placeholder="Division" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Divisions</SelectItem>
                {divisions?.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={businessUnitId || 'all'} onValueChange={v => {
              handleFilterChange(setBusinessUnitId, v === 'all' ? '' : v);
              setDepartmentId('');
            }}>
              <SelectTrigger><SelectValue placeholder="Business Unit" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Business Units</SelectItem>
                {(divisionId ? businessUnits?.filter(bu => bu.division_id === divisionId) : businessUnits)?.map(bu => (
                  <SelectItem key={bu.id} value={bu.id}>{bu.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={departmentId || 'all'} onValueChange={v => handleFilterChange(setDepartmentId, v === 'all' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Department" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {filteredDepartments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={categoryId || 'all'} onValueChange={v => handleFilterChange(setCategoryId, v === 'all' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>

            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search KPI / Employee..."
                className="pl-8"
                value={search}
                onChange={e => handleFilterChange(setSearch, e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Target className="h-8 w-8 text-primary" />
            <div>
              <p className="text-2xl font-bold">{summary.totalKpis}</p>
              <p className="text-xs text-muted-foreground">Unique KPIs</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Users className="h-8 w-8 text-primary/70" />
            <div>
              <p className="text-2xl font-bold">{summary.totalEmployees}</p>
              <p className="text-xs text-muted-foreground">Employees</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <BarChart3 className="h-8 w-8 text-accent-foreground" />
            <div>
              <p className="text-2xl font-bold">{summary.avgKpisPerEmployee}</p>
              <p className="text-xs text-muted-foreground">Avg KPIs / Employee</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-8 w-8 text-warning" />
            <div>
              <p className="text-2xl font-bold">{summary.orphanKpis}</p>
              <p className="text-xs text-muted-foreground">Orphan KPIs</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Export */}
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={exportToExcel} disabled={isLoading || !filteredRows.length}>
          <Download className="h-4 w-4 mr-1" /> Export Excel
        </Button>
      </div>

      {/* Matrix Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : !filteredRows.length ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            No KPI data found for the selected filters. Try adjusting the department or period.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-auto max-h-[65vh]">
              <Table className="table-fixed">
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead className="w-12 text-center sticky left-0 z-20 bg-background">Sr.</TableHead>
                    <TableHead className="w-36 sticky left-12 z-20 bg-background">Category</TableHead>
                    <TableHead className="w-44 sticky left-48 z-20 bg-background">KRA</TableHead>
                    <TableHead className="w-56 sticky left-[calc(12rem+11rem)] z-20 bg-background">KPI</TableHead>
                    <TableHead className="w-14 text-center">Wt%</TableHead>
                    <TableHead className="w-12 text-center">Emp#</TableHead>
                    {filteredEmployees.map(emp => (
                      <TableHead key={emp.id} className="w-20 text-center p-1">
                        <div
                          className="whitespace-nowrap text-xs font-medium"
                          style={{
                            writingMode: 'vertical-rl',
                            transform: 'rotate(180deg)',
                            maxHeight: '120px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          title={`${emp.fullName} (${emp.employeeCode})`}
                        >
                          {emp.fullName}
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedRows.map((row, idx) => (
                    <TableRow key={row.key}>
                      <TableCell className="text-center text-xs sticky left-0 bg-background">
                        {page * ROWS_PER_PAGE + idx + 1}
                      </TableCell>
                      <TableCell className="text-xs truncate sticky left-12 bg-background" title={row.categoryName}>
                        {row.categoryName}
                      </TableCell>
                      <TableCell className="text-xs truncate sticky left-48 bg-background" title={row.kraName}>
                        {row.kraName}
                      </TableCell>
                      <TableCell className="text-xs truncate sticky left-[calc(12rem+11rem)] bg-background" title={row.kpiName}>
                        {row.kpiName}
                      </TableCell>
                      <TableCell className="text-center text-xs font-medium">{row.weightage}</TableCell>
                      <TableCell className="text-center text-xs">{row.employeeCount}</TableCell>
                      {filteredEmployees.map(emp => {
                        const score = row.employeeScores[emp.id];
                        const wt = row.employeeWeightages[emp.id];
                        const isMapped = emp.id in row.employeeScores;
                        return (
                          <TableCell
                            key={emp.id}
                            className={`text-center text-xs ${isMapped ? (score != null ? 'bg-primary/5' : 'bg-muted/30') : ''}`}
                          >
                            {isMapped ? (
                              <div className="flex flex-col items-center gap-0.5">
                                <span className="font-semibold">{wt != null ? `${wt}%` : '—'}</span>
                                {score != null && (
                                  <span className="text-[10px] text-muted-foreground">{score}</span>
                                )}
                              </div>
                            ) : ''}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <p className="text-sm text-muted-foreground">
                  Showing {page * ROWS_PER_PAGE + 1}–{Math.min((page + 1) * ROWS_PER_PAGE, filteredRows.length)} of {filteredRows.length} KPIs
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                    Previous
                  </Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
