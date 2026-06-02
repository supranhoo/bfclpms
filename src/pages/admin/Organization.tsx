import { useState, useMemo } from 'react';
import { useDivisions, useBusinessUnits, useDepartments, useSubBranches, useProfiles, useDesignations, usePmsGrades, useLevels, useLocations, useEmployeeCategories, useEmploymentStatuses } from '@/hooks/useOrganization';
import { useCompanies, useCreateCompany, useUpdateCompany, useDeleteCompany, useCloneStructure } from '@/hooks/useCompanies';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TableSkeleton } from '@/components/ui/LoadingSkeletons';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Building2, Plus, Trash2, Pencil, Check, X, Copy, Settings } from 'lucide-react';
import { useResolvedTabs } from '@/hooks/useResolvedMenu';

type OrgTabKey =
  | 'divisions' | 'business-units' | 'departments' | 'sub-branches'
  | 'locations' | 'designations' | 'pms-grades' | 'levels'
  | 'employee-categories' | 'employment-statuses';

const ORG_TAB_DEFS: ReadonlyArray<{ key: OrgTabKey; menuKey: string; label: string }> = [
  { key: 'divisions',            menuKey: 'org-tab-divisions',           label: 'Divisions' },
  { key: 'business-units',       menuKey: 'org-tab-business-units',      label: 'Business Units' },
  { key: 'departments',          menuKey: 'org-tab-departments',         label: 'Departments' },
  { key: 'sub-branches',         menuKey: 'org-tab-sub-branches',        label: 'Sub-Branches' },
  { key: 'locations',            menuKey: 'org-tab-locations',           label: 'Locations' },
  { key: 'designations',         menuKey: 'org-tab-designations',        label: 'Designations' },
  { key: 'pms-grades',           menuKey: 'org-tab-pms-grades',          label: 'PMS Grades' },
  { key: 'levels',               menuKey: 'org-tab-levels',              label: 'Levels' },
  { key: 'employee-categories',  menuKey: 'org-tab-employee-categories', label: 'Employee Categories' },
  { key: 'employment-statuses',  menuKey: 'org-tab-employment-statuses', label: 'Employment Statuses' },
];

export default function Organization() {
  const { data: companies, isLoading: companiesLoading } = useCompanies();
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');

  // Auto-select default company
  const activeCompanyId = selectedCompanyId || companies?.find(c => c.is_default)?.id || companies?.[0]?.id || '';

  const { data: divisions, isLoading: divisionsLoading } = useDivisions(activeCompanyId || undefined);
  const { data: businessUnits, isLoading: busLoading } = useBusinessUnits();
  const { data: departments, isLoading: deptsLoading } = useDepartments();
  const { data: subBranches, isLoading: subLoading } = useSubBranches();
  const { data: designations, isLoading: designationsLoading } = useDesignations(activeCompanyId || undefined);
  const { data: pmsGrades, isLoading: pmsGradesLoading } = usePmsGrades(activeCompanyId || undefined);
  const { data: levels, isLoading: levelsLoading } = useLevels(activeCompanyId || undefined);
  const { data: locations, isLoading: locationsLoading } = useLocations(activeCompanyId || undefined);
  const { data: employeeCategories, isLoading: empCatLoading } = useEmployeeCategories(activeCompanyId || undefined);
  const { data: employmentStatuses, isLoading: empStatLoading } = useEmploymentStatuses();
  const { data: profiles } = useProfiles();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState<'division' | 'bu' | 'department' | 'sub-branch' | 'designation' | 'pms-grade' | 'level' | 'location' | 'employee-category' | 'employment-status'>('division');
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formParentId, setFormParentId] = useState('');

  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: string; id: string; name: string } | null>(null);

  // Inline code editing state
  const [editingCode, setEditingCode] = useState<{ type: string; id: string; code: string } | null>(null);

  // Company management dialog
  const [manageCompaniesOpen, setManageCompaniesOpen] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyCode, setNewCompanyCode] = useState('');
  const [editingCompany, setEditingCompany] = useState<{ id: string; name: string; code: string } | null>(null);
  const createCompany = useCreateCompany();
  const updateCompany = useUpdateCompany();
  const deleteCompany = useDeleteCompany();

  // Clone structure dialog
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
  const [cloneSourceId, setCloneSourceId] = useState('');
  const [cloneOptions, setCloneOptions] = useState({
    divisions: true,
    businessUnits: true,
    departments: true,
    subBranches: true,
    designations: true,
    pmsGrades: true,
    levels: true,
    locations: true,
  });
  const cloneStructure = useCloneStructure();

  // Filter BUs/Depts/SubBranches by selected company's divisions
  const companyDivisionIds = useMemo(() => new Set(divisions?.map(d => d.id) || []), [divisions]);
  const filteredBUs = useMemo(() => businessUnits?.filter(bu => bu.division_id && companyDivisionIds.has(bu.division_id)) || [], [businessUnits, companyDivisionIds]);
  const filteredBUIds = useMemo(() => new Set(filteredBUs.map(bu => bu.id)), [filteredBUs]);
  const filteredDepts = useMemo(() => departments?.filter(d => d.business_unit_id && filteredBUIds.has(d.business_unit_id)) || [], [departments, filteredBUIds]);
  const filteredDeptIds = useMemo(() => new Set(filteredDepts.map(d => d.id)), [filteredDepts]);
  const filteredSubBranches = useMemo(() => subBranches?.filter(sb => sb.department_id && filteredDeptIds.has(sb.department_id)) || [], [subBranches, filteredDeptIds]);

  // Calculate employee counts per department
  const employeeCountByDept = useMemo(() => {
    const counts = new Map<string, number>();
    profiles?.forEach(p => {
      if (p.department_id) {
        counts.set(p.department_id, (counts.get(p.department_id) || 0) + 1);
      }
    });
    return counts;
  }, [profiles]);

  const deptsWithEmployees = useMemo(() => new Set(employeeCountByDept.keys()), [employeeCountByDept]);
  const busWithEmployees = useMemo(() => {
    const set = new Set<string>();
    departments?.forEach(d => {
      if (deptsWithEmployees.has(d.id) && d.business_unit_id) set.add(d.business_unit_id);
    });
    return set;
  }, [departments, deptsWithEmployees]);
  const divsWithEmployees = useMemo(() => {
    const set = new Set<string>();
    businessUnits?.forEach(bu => {
      if (busWithEmployees.has(bu.id) && bu.division_id) set.add(bu.division_id);
    });
    return set;
  }, [businessUnits, busWithEmployees]);

  const createEntity = useMutation({
    mutationFn: async ({ type, name, code, parentId }: { type: string; name: string; code: string; parentId?: string }) => {
      let table = '';
      let data: any = { name, code: code || null };

      switch (type) {
        case 'division':
          table = 'divisions';
          data.company_id = activeCompanyId;
          break;
        case 'bu':
          table = 'business_units';
          data.division_id = parentId;
          break;
        case 'department':
          table = 'departments';
          data.business_unit_id = parentId;
          break;
        case 'sub-branch':
          table = 'sub_branches';
          data.department_id = parentId;
          break;
        case 'designation':
          table = 'designations';
          data.company_id = activeCompanyId;
          break;
        case 'pms-grade':
          table = 'pms_grades';
          data.company_id = activeCompanyId;
          break;
        case 'level':
          table = 'levels';
          data.company_id = activeCompanyId;
          break;
        case 'location':
          table = 'locations';
          data.company_id = activeCompanyId;
          break;
        case 'employee-category':
          table = 'employee_categories';
          data.company_id = activeCompanyId;
          break;
        case 'employment-status':
          table = 'employment_statuses';
          // global — no company_id
          break;
      }

      const { error } = await supabase.from(table as any).insert(data);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['divisions'] });
      queryClient.invalidateQueries({ queryKey: ['business-units'] });
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      queryClient.invalidateQueries({ queryKey: ['sub-branches'] });
      queryClient.invalidateQueries({ queryKey: ['designations'] });
      queryClient.invalidateQueries({ queryKey: ['pms-grades'] });
      queryClient.invalidateQueries({ queryKey: ['levels'] });
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      queryClient.invalidateQueries({ queryKey: ['employee-categories'] });
      queryClient.invalidateQueries({ queryKey: ['employment-statuses'] });
      toast({ title: 'Created successfully' });
      setDialogOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to create', description: error.message, variant: 'destructive' });
    },
  });

  const deleteEntity = useMutation({
    mutationFn: async ({ type, id }: { type: string; id: string }) => {
      let table = '';
      switch (type) {
        case 'division': table = 'divisions'; break;
        case 'bu': table = 'business_units'; break;
        case 'department': table = 'departments'; break;
        case 'sub-branch': table = 'sub_branches'; break;
        case 'designation': table = 'designations'; break;
        case 'pms-grade': table = 'pms_grades'; break;
        case 'level': table = 'levels'; break;
        case 'location': table = 'locations'; break;
        case 'employee-category': table = 'employee_categories'; break;
        case 'employment-status': table = 'employment_statuses'; break;
      }
      const { error } = await supabase.from(table as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['divisions'] });
      queryClient.invalidateQueries({ queryKey: ['business-units'] });
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      queryClient.invalidateQueries({ queryKey: ['sub-branches'] });
      queryClient.invalidateQueries({ queryKey: ['designations'] });
      queryClient.invalidateQueries({ queryKey: ['pms-grades'] });
      queryClient.invalidateQueries({ queryKey: ['levels'] });
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      queryClient.invalidateQueries({ queryKey: ['employee-categories'] });
      queryClient.invalidateQueries({ queryKey: ['employment-statuses'] });
      toast({ title: 'Deleted successfully' });
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to delete', description: error.message, variant: 'destructive' });
    },
  });

  const updateCode = useMutation({
    mutationFn: async ({ type, id, code }: { type: string; id: string; code: string }) => {
      let table = '';
      switch (type) {
        case 'division': table = 'divisions'; break;
        case 'bu': table = 'business_units'; break;
        case 'department': table = 'departments'; break;
        case 'sub-branch': table = 'sub_branches'; break;
        case 'designation': table = 'designations'; break;
        case 'pms-grade': table = 'pms_grades'; break;
        case 'level': table = 'levels'; break;
        case 'location': table = 'locations'; break;
        case 'employee-category': table = 'employee_categories'; break;
        case 'employment-status': table = 'employment_statuses'; break;
      }
      const { error } = await supabase.from(table as any).update({ code }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['divisions'] });
      queryClient.invalidateQueries({ queryKey: ['business-units'] });
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      queryClient.invalidateQueries({ queryKey: ['sub-branches'] });
      queryClient.invalidateQueries({ queryKey: ['designations'] });
      queryClient.invalidateQueries({ queryKey: ['pms-grades'] });
      queryClient.invalidateQueries({ queryKey: ['levels'] });
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      queryClient.invalidateQueries({ queryKey: ['employee-categories'] });
      queryClient.invalidateQueries({ queryKey: ['employment-statuses'] });
      toast({ title: 'Code updated successfully' });
      setEditingCode(null);
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update code', description: error.message, variant: 'destructive' });
    },
  });

  const resetForm = () => {
    setFormName('');
    setFormCode('');
    setFormParentId('');
  };

  const openCreateDialog = (type: typeof dialogType) => {
    setDialogType(type);
    resetForm();
    setDialogOpen(true);
  };

  const handleCreate = () => {
    createEntity.mutate({
      type: dialogType,
      name: formName,
      code: formCode,
      parentId: formParentId || undefined,
    });
  };

  const confirmDelete = (type: string, id: string, name: string) => {
    setDeleteTarget({ type, id, name });
    setDeleteDialogOpen(true);
  };

  const handleDelete = () => {
    if (deleteTarget) {
      deleteEntity.mutate({ type: deleteTarget.type, id: deleteTarget.id });
    }
  };

  const startEditCode = (type: string, id: string, currentCode: string | null) => {
    setEditingCode({ type, id, code: currentCode || '' });
  };

  const cancelEditCode = () => setEditingCode(null);

  const saveCode = () => {
    if (editingCode) {
      updateCode.mutate({ type: editingCode.type, id: editingCode.id, code: editingCode.code });
    }
  };

  const renderCodeCell = (type: string, id: string, currentCode: string | null) => {
    if (editingCode?.type === type && editingCode?.id === id) {
      return (
        <div className="flex items-center gap-2 w-full min-w-[260px]">
          <Input
            value={editingCode.code}
            onChange={(e) => setEditingCode({ ...editingCode, code: e.target.value })}
            className="h-7 flex-1 min-w-0"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveCode();
              if (e.key === 'Escape') cancelEditCode();
            }}
          />
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={saveCode} disabled={updateCode.isPending}>
            <Check className="h-3.5 w-3.5 text-green-600" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={cancelEditCode}>
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1 group">
        <span title={currentCode || ''}>{currentCode || '-'}</span>
        <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => startEditCode(type, id, currentCode)}>
          <Pencil className="h-3 w-3 text-muted-foreground" />
        </Button>
      </div>
    );
  };

  const handleClone = () => {
    if (!cloneSourceId || !activeCompanyId || cloneSourceId === activeCompanyId) return;
    cloneStructure.mutate({
      sourceCompanyId: cloneSourceId,
      targetCompanyId: activeCompanyId,
      cloneDivisions: cloneOptions.divisions,
      cloneBusinessUnits: cloneOptions.businessUnits,
      cloneDepartments: cloneOptions.departments,
      cloneSubBranches: cloneOptions.subBranches,
      cloneDesignations: cloneOptions.designations,
      clonePmsGrades: cloneOptions.pmsGrades,
      cloneLevels: cloneOptions.levels,
      cloneLocations: cloneOptions.locations,
    }, {
      onSuccess: () => setCloneDialogOpen(false),
    });
  };

  const activeCompany = companies?.find(c => c.id === activeCompanyId);
  const isLoading = companiesLoading || divisionsLoading || busLoading || deptsLoading || subLoading || designationsLoading || pmsGradesLoading || levelsLoading || locationsLoading || empCatLoading || empStatLoading;

  if (isLoading && !companies) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="space-y-2">
          <div className="h-8 w-52 bg-muted animate-pulse rounded" />
          <div className="h-4 w-80 bg-muted animate-pulse rounded" />
        </div>
        <div className="h-10 w-full max-w-lg bg-muted animate-pulse rounded" />
        <TableSkeleton rows={6} columns={4} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Company Selector Header */}
      <div>
        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <Building2 className="h-5 w-5 text-primary" />
          <Select value={activeCompanyId} onValueChange={setSelectedCompanyId}>
            <SelectTrigger className="w-64 h-9">
              <SelectValue placeholder="Select company" />
            </SelectTrigger>
            <SelectContent>
              {companies?.map(c => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name} {c.is_default && '(Default)'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => setManageCompaniesOpen(true)}>
            <Settings className="h-4 w-4 mr-1" /> Manage Companies
          </Button>
          {companies && companies.length > 1 && (
            <Button variant="outline" size="sm" onClick={() => { setCloneSourceId(''); setCloneDialogOpen(true); }}>
              <Copy className="h-4 w-4 mr-1" /> Clone Structure From...
            </Button>
          )}
        </div>
        <h1 className="text-2xl font-bold text-foreground">Organization Structure</h1>
        <p className="text-muted-foreground">Manage divisions, business units, departments, sub-branches, locations, designations, PMS grades and levels</p>
      </div>

      <Tabs defaultValue="divisions">
        <OrgTabsList
          counts={{
            'divisions':            divisions?.length || 0,
            'business-units':       filteredBUs.length,
            'departments':          filteredDepts.length,
            'sub-branches':         filteredSubBranches.length,
            'locations':            locations?.length || 0,
            'designations':         designations?.length || 0,
            'pms-grades':           pmsGrades?.length || 0,
            'levels':               levels?.length || 0,
            'employee-categories':  employeeCategories?.length || 0,
            'employment-statuses':  employmentStatuses?.length || 0,
          }}
        />

        <TabsContent value="divisions">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Divisions</CardTitle>
                <CardDescription>Top-level organizational units</CardDescription>
              </div>
              <Button onClick={() => openCreateDialog('division')}>
                <Plus className="h-4 w-4 mr-2" />
                Add Division
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Business Units</TableHead>
                    <TableHead>Employees</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {divisions?.map(div => {
                    const hasEmployees = divsWithEmployees.has(div.id);
                    const buCount = filteredBUs.filter(bu => bu.division_id === div.id).length;
                    return (
                      <TableRow key={div.id}>
                        <TableCell className="font-medium">{div.name}</TableCell>
                        <TableCell>{renderCodeCell('division', div.id, div.code)}</TableCell>
                        <TableCell>{buCount}</TableCell>
                        <TableCell>
                          {hasEmployees ? <Badge variant="secondary">In Use</Badge> : <Badge variant="outline">Unused</Badge>}
                        </TableCell>
                        <TableCell>
                          {!hasEmployees && (
                            <Button variant="ghost" size="icon" onClick={() => confirmDelete('division', div.id, div.name)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="business-units">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Business Units</CardTitle>
                <CardDescription>Units within divisions</CardDescription>
              </div>
              <Button onClick={() => openCreateDialog('bu')}>
                <Plus className="h-4 w-4 mr-2" />
                Add Business Unit
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Division</TableHead>
                    <TableHead>Departments</TableHead>
                    <TableHead>Employees</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBUs.map(bu => {
                    const hasEmployees = busWithEmployees.has(bu.id);
                    const deptCount = filteredDepts.filter(d => d.business_unit_id === bu.id).length;
                    return (
                      <TableRow key={bu.id}>
                        <TableCell className="font-medium">{bu.name}</TableCell>
                        <TableCell>{renderCodeCell('bu', bu.id, bu.code)}</TableCell>
                        <TableCell>{(bu.divisions as any)?.name || '-'}</TableCell>
                        <TableCell>{deptCount}</TableCell>
                        <TableCell>
                          {hasEmployees ? <Badge variant="secondary">In Use</Badge> : <Badge variant="outline">Unused</Badge>}
                        </TableCell>
                        <TableCell>
                          {!hasEmployees && (
                            <Button variant="ghost" size="icon" onClick={() => confirmDelete('bu', bu.id, bu.name)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="departments">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Departments</CardTitle>
                <CardDescription>Departments within business units</CardDescription>
              </div>
              <Button onClick={() => openCreateDialog('department')}>
                <Plus className="h-4 w-4 mr-2" />
                Add Department
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Business Unit</TableHead>
                    <TableHead>Sub-Branches</TableHead>
                    <TableHead>Employees</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDepts.map(dept => {
                    const empCount = employeeCountByDept.get(dept.id) || 0;
                    const hasEmployees = empCount > 0;
                    const sbCount = filteredSubBranches.filter(sb => sb.department_id === dept.id).length;
                    return (
                      <TableRow key={dept.id}>
                        <TableCell className="font-medium">{dept.name}</TableCell>
                        <TableCell>{renderCodeCell('department', dept.id, dept.code)}</TableCell>
                        <TableCell>{(dept.business_units as any)?.name || '-'}</TableCell>
                        <TableCell>{sbCount}</TableCell>
                        <TableCell>
                          {hasEmployees ? <Badge variant="secondary">{empCount} employees</Badge> : <Badge variant="outline">Unused</Badge>}
                        </TableCell>
                        <TableCell>
                          {!hasEmployees && (
                            <Button variant="ghost" size="icon" onClick={() => confirmDelete('department', dept.id, dept.name)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sub-branches">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Sub-Branches</CardTitle>
                <CardDescription>Sub-branches within departments</CardDescription>
              </div>
              <Button onClick={() => openCreateDialog('sub-branch')}>
                <Plus className="h-4 w-4 mr-2" />
                Add Sub-Branch
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSubBranches.map(sb => (
                    <TableRow key={sb.id}>
                      <TableCell className="font-medium">{sb.name}</TableCell>
                      <TableCell>{renderCodeCell('sub-branch', sb.id, sb.code)}</TableCell>
                      <TableCell>{(sb.departments as any)?.name || '-'}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => confirmDelete('sub-branch', sb.id, sb.name)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="locations">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Locations</CardTitle>
                <CardDescription>Physical sites / offices used in employee master & imports</CardDescription>
              </div>
              <Button onClick={() => openCreateDialog('location')}>
                <Plus className="h-4 w-4 mr-2" />
                Add Location
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {locations?.map((loc: any) => (
                    <TableRow key={loc.id}>
                      <TableCell className="font-medium">{loc.name}</TableCell>
                      <TableCell>{renderCodeCell('location', loc.id, loc.code)}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => confirmDelete('location', loc.id, loc.name)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!locations || locations.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-6">
                        No locations yet. Add one to enable Location lookup in employee imports.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="designations">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Designations</CardTitle>
                <CardDescription>Job titles and designations</CardDescription>
              </div>
              <Button onClick={() => openCreateDialog('designation')}>
                <Plus className="h-4 w-4 mr-2" />
                Add Designation
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {designations?.map(d => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">{d.name}</TableCell>
                      <TableCell>{renderCodeCell('designation', d.id, d.code)}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => confirmDelete('designation', d.id, d.name)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pms-grades">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>PMS Grades</CardTitle>
                <CardDescription>Performance management system grades</CardDescription>
              </div>
              <Button onClick={() => openCreateDialog('pms-grade')}>
                <Plus className="h-4 w-4 mr-2" />
                Add PMS Grade
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pmsGrades?.map(g => (
                    <TableRow key={g.id}>
                      <TableCell className="font-medium">{g.name}</TableCell>
                      <TableCell>{renderCodeCell('pms-grade', g.id, g.code)}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => confirmDelete('pms-grade', g.id, g.name)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="levels">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Levels</CardTitle>
                <CardDescription>Employee classification levels</CardDescription>
              </div>
              <Button onClick={() => openCreateDialog('level')}>
                <Plus className="h-4 w-4 mr-2" />
                Add Level
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {levels?.map((l: any) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium">{l.name}</TableCell>
                      <TableCell>{renderCodeCell('level', l.id, l.code)}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => confirmDelete('level', l.id, l.name)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="employee-categories">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Employee Categories</CardTitle>
                <CardDescription>Workforce categorisation (e.g. Worker, Staff, Officer, Executive)</CardDescription>
              </div>
              <Button onClick={() => openCreateDialog('employee-category')}>
                <Plus className="h-4 w-4 mr-2" />
                Add Category
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employeeCategories?.map((c: any) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>{renderCodeCell('employee-category', c.id, c.code)}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => confirmDelete('employee-category', c.id, c.name)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!employeeCategories || employeeCategories.length === 0) && (
                    <TableRow><TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-6">No categories yet — click "Add Category" to create one.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="employment-statuses">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Employment Statuses</CardTitle>
                <CardDescription>Lifecycle states such as Probation, Trainee, Confirmed, Superannuated, Retainer. Shared across all companies.</CardDescription>
              </div>
              <Button onClick={() => openCreateDialog('employment-status')}>
                <Plus className="h-4 w-4 mr-2" />
                Add Status
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employmentStatuses?.map((s: any) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>{renderCodeCell('employment-status', s.id, s.code)}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => confirmDelete('employment-status', s.id, s.name)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Entity Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Add {dialogType === 'bu' ? 'Business Unit' : dialogType === 'sub-branch' ? 'Sub-Branch' : dialogType === 'pms-grade' ? 'PMS Grade' : dialogType === 'level' ? 'Level' : dialogType === 'location' ? 'Location' : dialogType === 'employee-category' ? 'Employee Category' : dialogType === 'employment-status' ? 'Employment Status' : dialogType.charAt(0).toUpperCase() + dialogType.slice(1)}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Enter name" />
            </div>
            <div className="space-y-2">
              <Label>Code</Label>
              <Input value={formCode} onChange={(e) => setFormCode(e.target.value)} placeholder="Enter code (optional)" />
            </div>
            {dialogType === 'bu' && (
              <div className="space-y-2">
                <Label>Division</Label>
                <Select value={formParentId} onValueChange={setFormParentId}>
                  <SelectTrigger><SelectValue placeholder="Select division" /></SelectTrigger>
                  <SelectContent>
                    {divisions?.map(d => (<SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {dialogType === 'department' && (
              <div className="space-y-2">
                <Label>Business Unit</Label>
                <Select value={formParentId} onValueChange={setFormParentId}>
                  <SelectTrigger><SelectValue placeholder="Select business unit" /></SelectTrigger>
                  <SelectContent>
                    {filteredBUs.map(bu => (<SelectItem key={bu.id} value={bu.id}>{bu.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {dialogType === 'sub-branch' && (
              <div className="space-y-2">
                <Label>Department</Label>
                <Select value={formParentId} onValueChange={setFormParentId}>
                  <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                  <SelectContent>
                    {filteredDepts.map(d => (<SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!formName || createEntity.isPending}>
              {createEntity.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.type === 'bu' ? 'Business Unit' : deleteTarget?.type}?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteTarget?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteEntity.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Manage Companies Dialog */}
      <Dialog open={manageCompaniesOpen} onOpenChange={setManageCompaniesOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Manage Companies</DialogTitle>
            <DialogDescription>Create, edit, or delete companies</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Add new company */}
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Company Name</Label>
                <Input value={newCompanyName} onChange={e => setNewCompanyName(e.target.value)} placeholder="Enter company name" className="h-8" />
              </div>
              <div className="w-24 space-y-1">
                <Label className="text-xs">Code</Label>
                <Input value={newCompanyCode} onChange={e => setNewCompanyCode(e.target.value)} placeholder="Code" className="h-8" />
              </div>
              <Button size="sm" disabled={!newCompanyName.trim() || createCompany.isPending} onClick={() => {
                createCompany.mutate({ name: newCompanyName.trim(), code: newCompanyCode.trim() || undefined }, {
                  onSuccess: () => { setNewCompanyName(''); setNewCompanyCode(''); },
                });
              }}>
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>

            {/* Company list */}
            <div className="border rounded-md divide-y max-h-60 overflow-y-auto">
              {companies?.map(c => (
                <div key={c.id} className="flex items-center justify-between px-3 py-2">
                  {editingCompany?.id === c.id ? (
                    <div className="flex items-center gap-2 flex-1">
                      <Input value={editingCompany.name} onChange={e => setEditingCompany({ ...editingCompany, name: e.target.value })} className="h-7 flex-1" autoFocus />
                      <Input value={editingCompany.code} onChange={e => setEditingCompany({ ...editingCompany, code: e.target.value })} className="h-7 w-20" placeholder="Code" />
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                        updateCompany.mutate({ id: c.id, name: editingCompany.name, code: editingCompany.code || undefined }, {
                          onSuccess: () => setEditingCompany(null),
                        });
                      }}>
                        <Check className="h-3.5 w-3.5 text-green-600" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingCompany(null)}>
                        <X className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{c.name}</span>
                        {c.code && <span className="text-xs text-muted-foreground">({c.code})</span>}
                        {c.is_default && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Default</Badge>}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingCompany({ id: c.id, name: c.name, code: c.code || '' })}>
                          <Pencil className="h-3 w-3 text-muted-foreground" />
                        </Button>
                        {!c.is_default && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteCompany.mutate(c.id)} disabled={deleteCompany.isPending}>
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))}
              {(!companies || companies.length === 0) && (
                <div className="px-3 py-4 text-sm text-muted-foreground text-center">No companies yet</div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Clone Structure Dialog */}
      <Dialog open={cloneDialogOpen} onOpenChange={setCloneDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clone Structure From Another Company</DialogTitle>
            <DialogDescription>
              Copy organizational structure from a source company into <strong>{activeCompany?.name}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Source Company</Label>
              <Select value={cloneSourceId} onValueChange={setCloneSourceId}>
                <SelectTrigger><SelectValue placeholder="Select source company" /></SelectTrigger>
                <SelectContent>
                  {companies?.filter(c => c.id !== activeCompanyId).map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>What to clone</Label>
              <div className="space-y-2">
                {[
                  { key: 'divisions', label: 'Divisions' },
                  { key: 'businessUnits', label: 'Business Units' },
                  { key: 'departments', label: 'Departments' },
                  { key: 'subBranches', label: 'Sub-Branches' },
                  { key: 'designations', label: 'Designations' },
                  { key: 'pmsGrades', label: 'PMS Grades' },
                  { key: 'levels', label: 'Levels' },
                  { key: 'locations', label: 'Locations' },
                ].map(item => (
                  <div key={item.key} className="flex items-center gap-2">
                    <Checkbox
                      id={`clone-${item.key}`}
                      checked={cloneOptions[item.key as keyof typeof cloneOptions]}
                      onCheckedChange={(checked) => setCloneOptions(prev => ({ ...prev, [item.key]: !!checked }))}
                    />
                    <label htmlFor={`clone-${item.key}`} className="text-sm">{item.label}</label>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloneDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleClone} disabled={!cloneSourceId || cloneStructure.isPending}>
              {cloneStructure.isPending ? 'Cloning...' : 'Clone Selected'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OrgTabsList({ counts }: { counts: Record<OrgTabKey, number> }) {
  const tabs = useResolvedTabs(ORG_TAB_DEFS);
  return (
    <TabsList className="flex-wrap">
      {tabs.map((t) => (
        <TabsTrigger key={t.key} value={t.key}>
          {t.label} ({counts[t.key as OrgTabKey] ?? 0})
        </TabsTrigger>
      ))}
    </TabsList>
  );
}
