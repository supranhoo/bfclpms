import { useState, useMemo, useCallback } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { Check, X, Download, RotateCcw, Search, Users, Percent, UserCheck, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { useKpiMappingMatrix, type KpiMappingFilters, type EmployeeMatrixRow, type MatrixSortConfig } from '@/hooks/useAdminReports';
import { useDivisions, useBusinessUnits, useDepartments } from '@/hooks/useOrganization';
import { useEmployeeFilterOptions } from '@/hooks/useEmployeeFilterOptions';
import * as XLSX from 'xlsx';

// Fiscal order: Jul–Jun
const MONTH_HEADERS = ['Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May','Jun'];
const MONTH_KEYS = ['jul','aug','sep','oct','nov','dec','jan','feb','mar','apr','may','jun'] as const;

const currentYear = new Date().getFullYear();
// Fiscal year starts in July; show label like "2025-26"
const fiscalLabel = (startYear: number) => `${startYear}-${String(startYear + 1).slice(-2)}`;
const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

export default function KpiMappingMatrix() {
  const [filters, setFilters] = useState<KpiMappingFilters>({
    year: currentYear,
    divisionId: '',
    businessUnitId: '',
    departmentId: '',
    grade: '',
    designation: '',
    search: '',
  });
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<MatrixSortConfig>({ field: 'name', direction: 'asc' });

  const toggleSort = useCallback((field: MatrixSortConfig['field']) => {
    setPage(1);
    setSort(prev => prev.field === field ? { field, direction: prev.direction === 'asc' ? 'desc' : 'asc' } : { field, direction: 'asc' });
  }, []);

  const SortIcon = ({ field }: { field: MatrixSortConfig['field'] }) => {
    if (sort.field !== field) return <ArrowUpDown className="h-3 w-3 ml-1 text-muted-foreground" />;
    return sort.direction === 'asc' ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  const { rows, allFilteredRows, totalCount, totalEmployees, mappedEmployees, coveragePercent, isLoading, totalPages } = useKpiMappingMatrix(filters, page, sort);
  const { data: divisions } = useDivisions();
  const { data: businessUnits } = useBusinessUnits();
  const { data: departments } = useDepartments();
  const { grades, designations } = useEmployeeFilterOptions();

  // Cascading filters
  const filteredBUs = useMemo(() => {
    if (!businessUnits) return [];
    if (!filters.divisionId) return businessUnits;
    return businessUnits.filter((bu: any) => bu.division_id === filters.divisionId);
  }, [businessUnits, filters.divisionId]);

  const filteredDepts = useMemo(() => {
    if (!departments) return [];
    if (!filters.businessUnitId && !filters.divisionId) return departments;
    if (filters.businessUnitId) return departments.filter((d: any) => d.business_unit_id === filters.businessUnitId);
    if (filters.divisionId) {
      const buIds = filteredBUs.map((bu: any) => bu.id);
      return departments.filter((d: any) => buIds.includes(d.business_unit_id));
    }
    return departments;
  }, [departments, filters.businessUnitId, filters.divisionId, filteredBUs]);

  const updateFilter = (key: keyof KpiMappingFilters, value: string | number) => {
    setPage(1);
    setFilters(prev => {
      const next = { ...prev, [key]: value };
      // Clear cascading
      if (key === 'divisionId') { next.businessUnitId = ''; next.departmentId = ''; }
      if (key === 'businessUnitId') { next.departmentId = ''; }
      return next;
    });
  };

  const resetFilters = () => {
    setPage(1);
    setFilters({ year: currentYear, divisionId: '', businessUnitId: '', departmentId: '', grade: '', designation: '', search: '' });
  };

  const exportExcel = () => {
    const wsData = allFilteredRows.length > 0 ? getExportData(allFilteredRows) : [];
    if (wsData.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'KPI Mapping');
    XLSX.writeFile(wb, `KPI_Mapping_Matrix_${fiscalLabel(filters.year)}.xlsx`);
  };

  const getExportData = (data: EmployeeMatrixRow[]) =>
    data.map(r => ({
      'Employee Code': r.code,
      'Name': r.name,
      'Grade': r.grade,
      'Designation': r.designation,
      'Department': r.department,
      'First Mapped': r.firstMappedMonth || '-',
      ...Object.fromEntries(MONTH_HEADERS.map((m, i) => [m, r.months[MONTH_KEYS[i]] ? 'Yes' : 'No'])),
    }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="KPI Mapping Matrix"
        description="12-month view of KPI mapping status per employee"
        backTo="/admin"
      />

      {/* Summary Cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <Users className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-2xl font-bold">{isLoading ? '-' : totalEmployees}</p>
              <p className="text-xs text-muted-foreground">Total Employees</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <UserCheck className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-2xl font-bold">{isLoading ? '-' : mappedEmployees}</p>
              <p className="text-xs text-muted-foreground">Mapped Employees</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <Percent className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-2xl font-bold">{isLoading ? '-' : `${coveragePercent}%`}</p>
              <p className="text-xs text-muted-foreground">Mapping Coverage</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-3 items-end">
            {/* Year */}
            <div className="w-[100px]">
              <Select value={String(filters.year)} onValueChange={v => updateFilter('year', Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {yearOptions.map(y => <SelectItem key={y} value={String(y)}>{fiscalLabel(y)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Division */}
            <div className="w-[160px]">
              <Select value={filters.divisionId || 'all'} onValueChange={v => updateFilter('divisionId', v === 'all' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Division" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Divisions</SelectItem>
                  {divisions?.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Business Unit */}
            <div className="w-[160px]">
              <Select value={filters.businessUnitId || 'all'} onValueChange={v => updateFilter('businessUnitId', v === 'all' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Business Unit" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All BUs</SelectItem>
                  {filteredBUs.map((bu: any) => <SelectItem key={bu.id} value={bu.id}>{bu.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Department */}
            <div className="w-[160px]">
              <Select value={filters.departmentId || 'all'} onValueChange={v => updateFilter('departmentId', v === 'all' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Department" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Depts</SelectItem>
                  {filteredDepts.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Grade */}
            <div className="w-[130px]">
              <Select value={filters.grade || 'all'} onValueChange={v => updateFilter('grade', v === 'all' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Grade" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Grades</SelectItem>
                  {grades.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Designation */}
            <div className="w-[160px]">
              <Select value={filters.designation || 'all'} onValueChange={v => updateFilter('designation', v === 'all' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Designation" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Designations</SelectItem>
                  {designations.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Search */}
            <div className="relative w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search name/code..."
                value={filters.search}
                onChange={e => updateFilter('search', e.target.value)}
                className="pl-8"
              />
            </div>

            <Button variant="outline" size="icon" onClick={resetFilters} title="Reset Filters">
              <RotateCcw className="h-4 w-4" />
            </Button>

            <div className="ml-auto">
              <Button variant="outline" onClick={exportExcel} disabled={allFilteredRows.length === 0}>
                <Download className="h-4 w-4 mr-2" />
                Export Excel
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Matrix Table */}
      {isLoading ? (
        <Card>
          <CardContent className="pt-6 space-y-3">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center py-12">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No employees match the selected filters.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6 p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[100px] sticky left-0 bg-background z-10 cursor-pointer select-none" onClick={() => toggleSort('code')}>
                      <span className="inline-flex items-center">Code<SortIcon field="code" /></span>
                    </TableHead>
                    <TableHead className="min-w-[150px] cursor-pointer select-none" onClick={() => toggleSort('name')}>
                      <span className="inline-flex items-center">Name<SortIcon field="name" /></span>
                    </TableHead>
                    <TableHead className="min-w-[80px] cursor-pointer select-none" onClick={() => toggleSort('grade')}>
                      <span className="inline-flex items-center">Grade<SortIcon field="grade" /></span>
                    </TableHead>
                    <TableHead className="min-w-[120px] cursor-pointer select-none" onClick={() => toggleSort('designation')}>
                      <span className="inline-flex items-center">Designation<SortIcon field="designation" /></span>
                    </TableHead>
                    <TableHead className="min-w-[120px] cursor-pointer select-none" onClick={() => toggleSort('department')}>
                      <span className="inline-flex items-center">Department<SortIcon field="department" /></span>
                    </TableHead>
                    <TableHead className="min-w-[100px] cursor-pointer select-none" onClick={() => toggleSort('firstMappedMonth')}>
                      <span className="inline-flex items-center">First Mapped<SortIcon field="firstMappedMonth" /></span>
                    </TableHead>
                    {MONTH_HEADERS.map(m => (
                      <TableHead key={m} className="text-center min-w-[50px]">{m}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(row => (
                    <TableRow key={row.employeeId}>
                      <TableCell className="font-mono text-xs sticky left-0 bg-background z-10">{row.code || '-'}</TableCell>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell>{row.grade || '-'}</TableCell>
                      <TableCell>{row.designation || '-'}</TableCell>
                      <TableCell>{row.department || '-'}</TableCell>
                      <TableCell>
                        {row.firstMappedMonth ? (
                          <Badge variant="secondary" className="text-xs">{row.firstMappedMonth.slice(0, 3)}</Badge>
                        ) : '-'}
                      </TableCell>
                      {MONTH_KEYS.map(key => (
                        <TableCell key={key} className="text-center p-2">
                          {row.months[key] ? (
                            <Check className="h-4 w-4 text-green-600 mx-auto" />
                          ) : (
                            <X className="h-4 w-4 text-muted-foreground/40 mx-auto" />
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className={page <= 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
              />
            </PaginationItem>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 7) {
                pageNum = i + 1;
              } else if (page <= 4) {
                pageNum = i + 1;
              } else if (page >= totalPages - 3) {
                pageNum = totalPages - 6 + i;
              } else {
                pageNum = page - 3 + i;
              }
              return (
                <PaginationItem key={pageNum}>
                  <PaginationLink
                    isActive={pageNum === page}
                    onClick={() => setPage(pageNum)}
                    className="cursor-pointer"
                  >
                    {pageNum}
                  </PaginationLink>
                </PaginationItem>
              );
            })}
            <PaginationItem>
              <PaginationNext
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className={page >= totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
