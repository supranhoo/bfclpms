import { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MultiSelectFilter } from '@/components/ui/multi-select-filter';
import { Users, Search, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useProgramMappings, useAddProgramMapping, useRemoveProgramMapping, useBulkAddProgramMappings, useBulkRemoveProgramMappings } from '@/hooks/useIncentivePrograms';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompanyFilter } from '@/hooks/useCompanyFilter';
import { CompanyFilter } from '@/components/reports/CompanyFilter';

interface Props {
  programId: string;
}

type SortKey = 'full_name' | 'company_name' | 'designation' | 'department_name' | 'bu_name' | 'division_name' | 'level' | 'pms_grade';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 20;

export function ProgramEmployeeMapping({ programId }: Props) {
  const { data: mappings = [], isLoading } = useProgramMappings(programId);
  const addMapping = useAddProgramMapping();
  const removeMapping = useRemoveProgramMapping();
  const bulkAdd = useBulkAddProgramMappings();
  const bulkRemove = useBulkRemoveProgramMappings();

  const {
    companies,
    selectedCompanyId,
    setSelectedCompanyId,
    filterByCompany,
    getCompanyName,
  } = useCompanyFilter();

  const [search, setSearch] = useState('');
  const [filterDivision, setFilterDivision] = useState<string[]>([]);
  const [filterBU, setFilterBU] = useState<string[]>([]);
  const [filterDept, setFilterDept] = useState<string[]>([]);
  const [filterDesig, setFilterDesig] = useState<string[]>([]);
  const [filterGrade, setFilterGrade] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>('full_name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(0);

  // Fetch all active employees with org joins
  const { data: allEmployees = [] } = useQuery({
    queryKey: ['employees-for-mapping'],
    queryFn: async () => {
      const data = await fetchAllPaged<any>((from, to) =>
        supabase
          .from('profiles')
          .select('id, full_name, employee_code, designation, pms_grade, level, department_id, departments(name, business_unit_id, business_units(name, division_id, divisions(name)))')
          .eq('is_active', true)
          .order('full_name')
          .range(from, to)
      );
      return data.map((e: any) => ({
        id: e.id,
        full_name: e.full_name || 'Unknown',
        employee_code: e.employee_code || '',
        designation: e.designation || '',
        pms_grade: e.pms_grade || '',
        level: e.level || '',
        department_name: e.departments?.name || '',
        department_id: e.department_id || '',
        bu_name: e.departments?.business_units?.name || '',
        bu_id: e.departments?.business_units?.id || '',
        division_name: e.departments?.business_units?.divisions?.name || '',
        division_id: e.departments?.business_units?.divisions?.id || '',
      }));
    },
  });

  // Enrich employees with company_name
  const employeesWithCompany = useMemo(() => {
    return allEmployees.map((e: any) => ({
      ...e,
      company_name: getCompanyName(e.id),
    }));
  }, [allEmployees, getCompanyName]);

  // Build mapped employee IDs set + id lookup
  const mappedSet = useMemo(() => {
    const s = new Set<string>();
    mappings.forEach((m: any) => {
      if (m.mapping_type === 'employee') s.add(m.mapping_value);
    });
    return s;
  }, [mappings]);

  const mappingIdByEmp = useMemo(() => {
    const m = new Map<string, string>();
    mappings.forEach((mp: any) => {
      if (mp.mapping_type === 'employee') m.set(mp.mapping_value, mp.id);
    });
    return m;
  }, [mappings]);

  // Distinct filter options
  const filterOptions = useMemo(() => {
    const divs = new Set<string>();
    const bus = new Set<string>();
    const depts = new Set<string>();
    const desigs = new Set<string>();
    const grades = new Set<string>();
    employeesWithCompany.forEach((e: any) => {
      if (e.division_name) divs.add(e.division_name);
      if (e.bu_name) bus.add(e.bu_name);
      if (e.department_name) depts.add(e.department_name);
      if (e.designation) desigs.add(e.designation);
      if (e.pms_grade) grades.add(e.pms_grade);
    });
    return {
      divisions: [...divs].sort(),
      bus: [...bus].sort(),
      depts: [...depts].sort(),
      desigs: [...desigs].sort(),
      grades: [...grades].sort(),
    };
  }, [employeesWithCompany]);

  // Filter + search
  const filtered = useMemo(() => {
    let list = employeesWithCompany;
    // Company filter
    if (selectedCompanyId !== 'all') {
      list = list.filter((e: any) => filterByCompany(e.id));
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((e: any) =>
        e.full_name.toLowerCase().includes(q) || e.employee_code.toLowerCase().includes(q)
      );
    }
    if (filterDivision.length > 0) list = list.filter((e: any) => filterDivision.includes(e.division_name));
    if (filterBU.length > 0) list = list.filter((e: any) => filterBU.includes(e.bu_name));
    if (filterDept.length > 0) list = list.filter((e: any) => filterDept.includes(e.department_name));
    if (filterDesig.length > 0) list = list.filter((e: any) => filterDesig.includes(e.designation));
    if (filterGrade.length > 0) list = list.filter((e: any) => filterGrade.includes(e.pms_grade));
    return list;
  }, [employeesWithCompany, selectedCompanyId, filterByCompany, search, filterDivision, filterBU, filterDept, filterDesig, filterGrade]);

  // Sort
  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a: any, b: any) => {
      const av = (a[sortKey] || '').toLowerCase();
      const bv = (b[sortKey] || '').toLowerCase();
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    return copy;
  }, [filtered, sortKey, sortDir]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paged = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Reset page on filter change
  const resetPage = () => setPage(0);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const toggleEmployee = useCallback((empId: string) => {
    if (mappingIdByEmp.has(empId)) {
      removeMapping.mutate(mappingIdByEmp.get(empId)!);
    } else {
      addMapping.mutate({ program_id: programId, mapping_type: 'employee', mapping_value: empId });
    }
  }, [mappingIdByEmp, programId, addMapping, removeMapping]);

  // Select all filtered (that are not already mapped)
  const unmappedFiltered = filtered.filter((e: any) => !mappedSet.has(e.id));
  const allFilteredMapped = unmappedFiltered.length === 0 && filtered.length > 0;

  const selectAllFiltered = () => {
    const rows = unmappedFiltered.map((e: any) => ({
      program_id: programId,
      mapping_type: 'employee' as const,
      mapping_value: e.id,
    }));
    if (rows.length > 0) bulkAdd.mutate(rows);
  };

  const clearAllFiltered = () => {
    const ids = filtered
      .map((e: any) => mappingIdByEmp.get(e.id))
      .filter(Boolean) as string[];
    if (ids.length > 0) bulkRemove.mutate(ids);
  };

  const clearFilters = () => {
    setSearch('');
    setSelectedCompanyId('all');
    setFilterDivision([]);
    setFilterBU([]);
    setFilterDept([]);
    setFilterDesig([]);
    setFilterGrade([]);
    resetPage();
  };

  const hasFilters = search || selectedCompanyId !== 'all' || filterDivision.length > 0 || filterBU.length > 0 || filterDept.length > 0 || filterDesig.length > 0 || filterGrade.length > 0;

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
    <Button variant="ghost" size="sm" className="h-auto p-0 font-medium text-muted-foreground hover:text-foreground" onClick={() => toggleSort(field)}>
      {label}
      <ArrowUpDown className="ml-1 h-3 w-3" />
    </Button>
  );

  if (isLoading) return <div className="text-sm text-muted-foreground py-4">Loading mappings...</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" /> Employee Mapping
        </CardTitle>
        <CardDescription>
          Define which employees are enrolled in this program. Select employees from the table below.
        </CardDescription>
        <div className="flex flex-wrap gap-1 pt-1">
          <Badge variant="secondary">{mappedSet.size} employee(s) mapped</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          <CompanyFilter
            companies={companies}
            selectedCompanyId={selectedCompanyId}
            onCompanyChange={(v) => { setSelectedCompanyId(v); resetPage(); }}
            className="h-8 text-xs"
          />
          <MultiSelectFilter
            options={filterOptions.divisions}
            value={filterDivision}
            onChange={(v) => { setFilterDivision(v); resetPage(); }}
            placeholder="All Divisions"
            label="Division"
            className="h-8 text-xs"
          />
          <MultiSelectFilter
            options={filterOptions.bus}
            value={filterBU}
            onChange={(v) => { setFilterBU(v); resetPage(); }}
            placeholder="All BUs"
            label="BU"
            className="h-8 text-xs"
          />
          <MultiSelectFilter
            options={filterOptions.depts}
            value={filterDept}
            onChange={(v) => { setFilterDept(v); resetPage(); }}
            placeholder="All Departments"
            label="Department"
            className="h-8 text-xs"
          />
          <MultiSelectFilter
            options={filterOptions.desigs}
            value={filterDesig}
            onChange={(v) => { setFilterDesig(v); resetPage(); }}
            placeholder="All Designations"
            label="Designation"
            className="h-8 text-xs"
          />
          <MultiSelectFilter
            options={filterOptions.grades}
            value={filterGrade}
            onChange={(v) => { setFilterGrade(v); resetPage(); }}
            placeholder="All Grades"
            label="Grade"
            className="h-8 text-xs"
          />
        </div>

        {/* Search + actions */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name or code..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); resetPage(); }}
              className="pl-8 h-8 text-sm"
            />
          </div>
          <Button variant="outline" size="sm" onClick={selectAllFiltered} disabled={allFilteredMapped || bulkAdd.isPending}>
            {allFilteredMapped ? '✓ All Selected' : `Select All (${unmappedFiltered.length})`}
          </Button>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>Clear Filters</Button>
          )}
        </div>

        {/* Table */}
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allFilteredMapped && filtered.length > 0}
                    onCheckedChange={() => allFilteredMapped ? clearAllFiltered() : selectAllFiltered()}
                    disabled={filtered.length === 0}
                  />
                </TableHead>
                <TableHead><SortHeader label="Company" field="company_name" /></TableHead>
                <TableHead><SortHeader label="Employee (Code)" field="full_name" /></TableHead>
                <TableHead><SortHeader label="Designation" field="designation" /></TableHead>
                <TableHead><SortHeader label="Department" field="department_name" /></TableHead>
                <TableHead><SortHeader label="BU" field="bu_name" /></TableHead>
                <TableHead><SortHeader label="Division" field="division_name" /></TableHead>
                <TableHead><SortHeader label="Level" field="level" /></TableHead>
                <TableHead><SortHeader label="Grade" field="pms_grade" /></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">
                    No employees found
                  </TableCell>
                </TableRow>
              ) : paged.map((emp: any) => (
                <TableRow key={emp.id} className="cursor-pointer" onClick={() => toggleEmployee(emp.id)}>
                  <TableCell>
                    <Checkbox
                      checked={mappedSet.has(emp.id)}
                      onCheckedChange={() => toggleEmployee(emp.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </TableCell>
                  <TableCell className="text-sm">{emp.company_name}</TableCell>
                  <TableCell className="text-sm font-medium">
                    {emp.full_name}
                    {emp.employee_code && <span className="text-muted-foreground ml-1">({emp.employee_code})</span>}
                  </TableCell>
                  <TableCell className="text-sm">{emp.designation}</TableCell>
                  <TableCell className="text-sm">{emp.department_name}</TableCell>
                  <TableCell className="text-sm">{emp.bu_name}</TableCell>
                  <TableCell className="text-sm">{emp.division_name}</TableCell>
                  <TableCell className="text-sm">{emp.level}</TableCell>
                  <TableCell className="text-sm">{emp.pms_grade}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {sorted.length === 0 ? 0 : page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sorted.length)} of {sorted.length} employees
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-7 w-7" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2">Page {page + 1} / {totalPages}</span>
            <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
