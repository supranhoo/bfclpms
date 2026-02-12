import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { useOrgLevelKpis } from '@/hooks/useOrgLevelKpis';
import { Loader2, Search, Building2, Users, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

interface MappingProps {
  reviewPeriod: string;
  reviewYear: number;
}

interface KpiMapping {
  categoryName: string;
  categoryColor: string;
  kraName: string;
  kpiName: string;
  categoryId: string;
  employees: Array<{
    id: string;
    fullName: string;
    employeeCode: string | null;
    departmentName: string | null;
    designation: string | null;
    status: string | null;
  }>;
}

function useOrgKpiFullMapping(reviewPeriod: string, reviewYear: number) {
  return useQuery({
    queryKey: ['org-kpi-full-mapping', reviewPeriod, reviewYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kpis')
        .select(`
          id, category_id, kra_name, kpi_name, employee_id, status,
          kra_categories(id, name, color),
          profiles!kpis_employee_id_fkey(id, full_name, employee_code, department_id, designation,
            departments(id, name)
          )
        `)
        .eq('is_org_level', true)
        .eq('review_period', reviewPeriod)
        .eq('review_year', reviewYear)
        .order('kra_name')
        .order('kpi_name');

      if (error) throw error;
      return data;
    },
    enabled: !!reviewPeriod && !!reviewYear,
  });
}

export function OrgKpiMappingDashboard({ reviewPeriod, reviewYear }: MappingProps) {
  const [search, setSearch] = useState('');
  const { data: mappingData, isLoading } = useOrgKpiFullMapping(reviewPeriod, reviewYear);

  // Group by KPI
  const byKpi = useMemo(() => {
    if (!mappingData) return [];
    const map = new Map<string, KpiMapping>();
    mappingData.forEach(kpi => {
      const key = `${kpi.category_id}||${kpi.kra_name}||${kpi.kpi_name}`;
      const profile = kpi.profiles as any;
      if (!map.has(key)) {
        map.set(key, {
          categoryName: (kpi.kra_categories as any)?.name || 'Unknown',
          categoryColor: (kpi.kra_categories as any)?.color || '#6B7280',
          kraName: kpi.kra_name,
          kpiName: kpi.kpi_name,
          categoryId: kpi.category_id,
          employees: [],
        });
      }
      if (profile) {
        map.get(key)!.employees.push({
          id: profile.id,
          fullName: profile.full_name || 'Unknown',
          employeeCode: profile.employee_code,
          departmentName: profile.departments?.name || null,
          designation: profile.designation,
          status: kpi.status,
        });
      }
    });
    return Array.from(map.values());
  }, [mappingData]);

  // Group by Employee
  const byEmployee = useMemo(() => {
    if (!mappingData) return [];
    const map = new Map<string, {
      employeeId: string;
      fullName: string;
      employeeCode: string | null;
      departmentName: string | null;
      designation: string | null;
      kpis: Array<{ kraName: string; kpiName: string; categoryName: string; status: string | null }>;
    }>();
    mappingData.forEach(kpi => {
      const profile = kpi.profiles as any;
      if (!profile) return;
      if (!map.has(profile.id)) {
        map.set(profile.id, {
          employeeId: profile.id,
          fullName: profile.full_name || 'Unknown',
          employeeCode: profile.employee_code,
          departmentName: profile.departments?.name || null,
          designation: profile.designation,
          kpis: [],
        });
      }
      map.get(profile.id)!.kpis.push({
        kraName: kpi.kra_name,
        kpiName: kpi.kpi_name,
        categoryName: (kpi.kra_categories as any)?.name || 'Unknown',
        status: kpi.status,
      });
    });
    return Array.from(map.values()).sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [mappingData]);

  // Group by Department
  const byDepartment = useMemo(() => {
    if (!mappingData) return [];
    const map = new Map<string, {
      departmentName: string;
      employees: Set<string>;
      kpiCount: number;
      kpis: Set<string>;
    }>();
    mappingData.forEach(kpi => {
      const profile = kpi.profiles as any;
      const deptName = profile?.departments?.name || 'Unassigned';
      if (!map.has(deptName)) {
        map.set(deptName, { departmentName: deptName, employees: new Set(), kpiCount: 0, kpis: new Set() });
      }
      const entry = map.get(deptName)!;
      if (profile) entry.employees.add(profile.id);
      entry.kpiCount++;
      entry.kpis.add(`${kpi.kra_name}||${kpi.kpi_name}`);
    });
    return Array.from(map.values()).sort((a, b) => b.employees.size - a.employees.size);
  }, [mappingData]);

  const filteredByKpi = byKpi.filter(k =>
    !search || k.kpiName.toLowerCase().includes(search.toLowerCase()) || k.kraName.toLowerCase().includes(search.toLowerCase())
  );
  const filteredByEmployee = byEmployee.filter(e =>
    !search || e.fullName.toLowerCase().includes(search.toLowerCase()) || (e.employeeCode?.toLowerCase().includes(search.toLowerCase()))
  );

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totalRecords = mappingData?.length || 0;
  const uniqueKpis = byKpi.length;
  const uniqueEmployees = byEmployee.length;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              <span className="text-sm text-muted-foreground">Unique Org KPIs</span>
            </div>
            <p className="text-2xl font-bold mt-1">{uniqueKpis}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <span className="text-sm text-muted-foreground">Employees Mapped</span>
            </div>
            <p className="text-2xl font-bold mt-1">{uniqueEmployees}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              <span className="text-sm text-muted-foreground">Total Records</span>
            </div>
            <p className="text-2xl font-bold mt-1">{totalRecords}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search KPIs or employees..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Tabs defaultValue="by-kpi">
        <TabsList>
          <TabsTrigger value="by-kpi">By KPI ({uniqueKpis})</TabsTrigger>
          <TabsTrigger value="by-employee">By Employee ({uniqueEmployees})</TabsTrigger>
          <TabsTrigger value="by-department">By Department ({byDepartment.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="by-kpi" className="space-y-3">
          {filteredByKpi.map((kpiGroup) => (
            <Card key={`${kpiGroup.categoryId}||${kpiGroup.kraName}||${kpiGroup.kpiName}`}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: kpiGroup.categoryColor }} />
                  <CardTitle className="text-sm">{kpiGroup.kraName} → {kpiGroup.kpiName}</CardTitle>
                  <Badge variant="secondary">{kpiGroup.employees.length} employees</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Designation</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {kpiGroup.employees.map(emp => (
                      <TableRow key={emp.id}>
                        <TableCell className="font-medium text-sm">{emp.fullName}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{emp.employeeCode || '—'}</TableCell>
                        <TableCell className="text-sm">{emp.departmentName || '—'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{emp.designation || '—'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{emp.status || 'kra_set'}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="by-employee" className="space-y-3">
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Org KPIs</TableHead>
                  <TableHead className="text-center">Count</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredByEmployee.map(emp => (
                  <TableRow key={emp.employeeId}>
                    <TableCell className="font-medium">{emp.fullName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{emp.employeeCode || '—'}</TableCell>
                    <TableCell className="text-sm">{emp.departmentName || '—'}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {emp.kpis.slice(0, 3).map((k, i) => (
                          <Badge key={i} variant="outline" className="text-xs">{k.kpiName}</Badge>
                        ))}
                        {emp.kpis.length > 3 && (
                          <Badge variant="secondary" className="text-xs">+{emp.kpis.length - 3}</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center font-medium">{emp.kpis.length}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="by-department" className="space-y-3">
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Department</TableHead>
                  <TableHead className="text-center">Employees</TableHead>
                  <TableHead className="text-center">Unique KPIs</TableHead>
                  <TableHead className="text-center">Total Records</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byDepartment.map(dept => (
                  <TableRow key={dept.departmentName}>
                    <TableCell className="font-medium">{dept.departmentName}</TableCell>
                    <TableCell className="text-center">{dept.employees.size}</TableCell>
                    <TableCell className="text-center">{dept.kpis.size}</TableCell>
                    <TableCell className="text-center">{dept.kpiCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
