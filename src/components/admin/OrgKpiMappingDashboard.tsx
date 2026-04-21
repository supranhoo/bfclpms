import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Loader2, Search, Building2, Users, User, UserPlus, Trash2, ChevronDown, Globe, Building, UserCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useRemoveEmployeeFromOrgKpi, useChangeOrgKpiScope } from '@/hooks/useOrgKpiManagement';
import { OrgKpiAddEmployeeDialog } from '@/components/admin/OrgKpiAddEmployeeDialog';
import { OrgKpiScopeChangeDialog } from '@/components/admin/OrgKpiScopeChangeDialog';

interface MappingProps {
  reviewPeriod: string;
  reviewYear: number;
}

interface EmployeeMapping {
  id: string;
  kpiId: string;
  fullName: string;
  employeeCode: string | null;
  departmentName: string | null;
  designation: string | null;
  status: string | null;
}

interface KpiMapping {
  categoryName: string;
  categoryColor: string;
  kraName: string;
  kpiName: string;
  categoryId: string;
  orgLevelScope: string | null;
  employees: EmployeeMapping[];
}

function useOrgKpiFullMapping(reviewPeriod: string, reviewYear: number) {
  return useQuery({
    queryKey: ['org-kpi-full-mapping', reviewPeriod, reviewYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kpis')
        .select(`
          id, category_id, kra_name, kpi_name, employee_id, status, org_level_scope,
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

const scopeIcons: Record<string, typeof Globe> = {
  organization: Globe,
  department: Building,
  employee: UserCheck,
};

const scopeLabels: Record<string, string> = {
  organization: 'Organization',
  department: 'Department',
  employee: 'Employee',
};

export function OrgKpiMappingDashboard({ reviewPeriod, reviewYear }: MappingProps) {
  const [search, setSearch] = useState('');
  const { data: mappingData, isLoading } = useOrgKpiFullMapping(reviewPeriod, reviewYear);

  // Add Employee dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addTarget, setAddTarget] = useState<KpiMapping | null>(null);

  // Remove confirmation state
  const [removeTarget, setRemoveTarget] = useState<{ kpiId: string; employeeName: string; kpiName: string } | null>(null);

  // Scope change dialog state
  const [scopeTarget, setScopeTarget] = useState<{ kpiGroup: KpiMapping; newScope: 'organization' | 'department' | 'employee' } | null>(null);

  const removeMutation = useRemoveEmployeeFromOrgKpi();

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
          orgLevelScope: kpi.org_level_scope || 'employee',
          employees: [],
        });
      }
      if (profile) {
        map.get(key)!.employees.push({
          id: profile.id,
          kpiId: kpi.id,
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
      kpis: Array<{ kraName: string; kpiName: string; categoryName: string; status: string | null; kpiId: string; categoryId: string }>;
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
        kpiId: kpi.id,
        categoryId: kpi.category_id,
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

  const handleScopeChange = (kpiGroup: KpiMapping, newScope: 'organization' | 'department' | 'employee') => {
    if ((kpiGroup.orgLevelScope || 'employee') === newScope) return;
    setScopeTarget({ kpiGroup, newScope });
  };

  const handleRemoveConfirm = () => {
    if (!removeTarget) return;
    removeMutation.mutate(
      { kpiId: removeTarget.kpiId, employeeName: removeTarget.employeeName },
      { onSettled: () => setRemoveTarget(null) }
    );
  };

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
          {filteredByKpi.map((kpiGroup) => {
            const currentScope = kpiGroup.orgLevelScope || 'organization';
            const ScopeIcon = scopeIcons[currentScope] || Globe;

            return (
              <Card key={`${kpiGroup.categoryId}||${kpiGroup.kraName}||${kpiGroup.kpiName}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: kpiGroup.categoryColor }} />
                    <CardTitle className="text-sm">{kpiGroup.kraName} → {kpiGroup.kpiName}</CardTitle>
                    <Badge variant="secondary">{kpiGroup.employees.length} employees</Badge>

                    {/* Scope Dropdown */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
                          <ScopeIcon className="h-3 w-3" />
                          {scopeLabels[currentScope]}
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        {(['organization', 'department', 'employee'] as const).map(scope => {
                          const Icon = scopeIcons[scope];
                          return (
                            <DropdownMenuItem
                              key={scope}
                              onClick={() => handleScopeChange(kpiGroup, scope)}
                              className={currentScope === scope ? 'font-medium' : ''}
                            >
                              <Icon className="h-4 w-4 mr-2" />
                              {scopeLabels[scope]}
                            </DropdownMenuItem>
                          );
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>

                    {/* Add Employee Button */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 text-xs ml-auto"
                      onClick={() => { setAddTarget(kpiGroup); setAddDialogOpen(true); }}
                    >
                      <UserPlus className="h-3 w-3" />
                      Add Employee
                    </Button>
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
                        <TableHead className="w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {kpiGroup.employees.map(emp => (
                        <TableRow key={emp.kpiId}>
                          <TableCell className="font-medium text-sm">{emp.fullName}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{emp.employeeCode || '—'}</TableCell>
                          <TableCell className="text-sm">{emp.departmentName || '—'}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{emp.designation || '—'}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">{emp.status || 'kra_set'}</Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => setRemoveTarget({ kpiId: emp.kpiId, employeeName: emp.fullName, kpiName: kpiGroup.kpiName })}
                              title="Remove from Org KPI"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            );
          })}
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
                        {emp.kpis.map((k) => (
                          <Badge
                            key={k.kpiId}
                            variant="outline"
                            className="text-xs group cursor-default gap-1"
                          >
                            {k.kpiName}
                            <button
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                              onClick={() => setRemoveTarget({ kpiId: k.kpiId, employeeName: emp.fullName, kpiName: k.kpiName })}
                              title="Remove"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
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

      {/* Add Employee Dialog */}
      {addTarget && (
        <OrgKpiAddEmployeeDialog
          open={addDialogOpen}
          onOpenChange={setAddDialogOpen}
          categoryId={addTarget.categoryId}
          kraName={addTarget.kraName}
          kpiName={addTarget.kpiName}
          reviewPeriod={reviewPeriod}
          reviewYear={reviewYear}
          existingEmployeeIds={addTarget.employees.map(e => e.id)}
        />
      )}

      {/* Remove Confirmation */}
      <AlertDialog open={!!removeTarget} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Employee from Org KPI</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove <strong>{removeTarget?.employeeName}</strong> from <strong>{removeTarget?.kpiName}</strong>.
              Their existing submission data will remain but will no longer be linked to org-level scoring.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Scope Change Cascade Dialog */}
      {scopeTarget && (
        <OrgKpiScopeChangeDialog
          open={!!scopeTarget}
          onClose={() => setScopeTarget(null)}
          identifier={{
            categoryId: scopeTarget.kpiGroup.categoryId,
            kraName: scopeTarget.kpiGroup.kraName,
            kpiName: scopeTarget.kpiGroup.kpiName,
            reviewPeriod,
            reviewYear,
          }}
          currentScope={scopeTarget.kpiGroup.orgLevelScope || 'employee'}
          newScope={scopeTarget.newScope}
        />
      )}
    </div>
  );
}
