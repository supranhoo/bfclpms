import { useState, useMemo } from 'react';
import { useDivisions, useBusinessUnits, useDepartments, useSubBranches, useProfiles, useDesignations, usePmsGrades } from '@/hooks/useOrganization';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TableSkeleton } from '@/components/ui/LoadingSkeletons';
import { Badge } from '@/components/ui/badge';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Building2, Plus, Trash2, Pencil, Check, X } from 'lucide-react';

export default function Organization() {
  const { data: divisions, isLoading: divisionsLoading } = useDivisions();
  const { data: businessUnits, isLoading: busLoading } = useBusinessUnits();
  const { data: departments, isLoading: deptsLoading } = useDepartments();
  const { data: subBranches, isLoading: subLoading } = useSubBranches();
  const { data: designations, isLoading: designationsLoading } = useDesignations();
  const { data: pmsGrades, isLoading: pmsGradesLoading } = usePmsGrades();
  const { data: profiles } = useProfiles();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState<'division' | 'bu' | 'department' | 'sub-branch' | 'designation' | 'pms-grade'>('division');
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formParentId, setFormParentId] = useState('');

  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: string; id: string; name: string } | null>(null);

  // Inline code editing state
  const [editingCode, setEditingCode] = useState<{ type: string; id: string; code: string } | null>(null);

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

  // Calculate which departments have employees (directly)
  const deptsWithEmployees = useMemo(() => new Set(employeeCountByDept.keys()), [employeeCountByDept]);

  // Calculate which business units have employees (through departments)
  const busWithEmployees = useMemo(() => {
    const set = new Set<string>();
    departments?.forEach(d => {
      if (deptsWithEmployees.has(d.id) && d.business_unit_id) {
        set.add(d.business_unit_id);
      }
    });
    return set;
  }, [departments, deptsWithEmployees]);

  // Calculate which divisions have employees (through business units)
  const divsWithEmployees = useMemo(() => {
    const set = new Set<string>();
    businessUnits?.forEach(bu => {
      if (busWithEmployees.has(bu.id) && bu.division_id) {
        set.add(bu.division_id);
      }
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
          break;
        case 'pms-grade':
          table = 'pms_grades';
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
        case 'division':
          table = 'divisions';
          break;
        case 'bu':
          table = 'business_units';
          break;
        case 'department':
          table = 'departments';
          break;
        case 'sub-branch':
          table = 'sub_branches';
          break;
        case 'designation':
          table = 'designations';
          break;
        case 'pms-grade':
          table = 'pms_grades';
          break;
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
        case 'division':
          table = 'divisions';
          break;
        case 'bu':
          table = 'business_units';
          break;
        case 'department':
          table = 'departments';
          break;
        case 'sub-branch':
          table = 'sub_branches';
          break;
        case 'designation':
          table = 'designations';
          break;
        case 'pms-grade':
          table = 'pms_grades';
          break;
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

  const cancelEditCode = () => {
    setEditingCode(null);
  };

  const saveCode = () => {
    if (editingCode) {
      updateCode.mutate({ type: editingCode.type, id: editingCode.id, code: editingCode.code });
    }
  };

  const renderCodeCell = (type: string, id: string, currentCode: string | null) => {
    if (editingCode?.type === type && editingCode?.id === id) {
      return (
        <div className="flex items-center gap-1">
          <Input
            value={editingCode.code}
            onChange={(e) => setEditingCode({ ...editingCode, code: e.target.value })}
            className="h-7 w-24"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveCode();
              if (e.key === 'Escape') cancelEditCode();
            }}
          />
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={saveCode} disabled={updateCode.isPending}>
            <Check className="h-3.5 w-3.5 text-green-600" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={cancelEditCode}>
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1 group">
        <span>{currentCode || '-'}</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => startEditCode(type, id, currentCode)}
        >
          <Pencil className="h-3 w-3 text-muted-foreground" />
        </Button>
      </div>
    );
  };

  const isLoading = divisionsLoading || busLoading || deptsLoading || subLoading || designationsLoading || pmsGradesLoading;

  if (isLoading) {
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
      <div>
        <h1 className="text-2xl font-bold text-foreground">Organization Structure</h1>
        <p className="text-muted-foreground">Manage divisions, business units, departments, sub-branches, designations and PMS grades</p>
      </div>

      <Tabs defaultValue="divisions">
        <TabsList className="flex-wrap">
          <TabsTrigger value="divisions">Divisions ({divisions?.length || 0})</TabsTrigger>
          <TabsTrigger value="business-units">Business Units ({businessUnits?.length || 0})</TabsTrigger>
          <TabsTrigger value="departments">Departments ({departments?.length || 0})</TabsTrigger>
          <TabsTrigger value="sub-branches">Sub-Branches ({subBranches?.length || 0})</TabsTrigger>
          <TabsTrigger value="designations">Designations ({designations?.length || 0})</TabsTrigger>
          <TabsTrigger value="pms-grades">PMS Grades ({pmsGrades?.length || 0})</TabsTrigger>
        </TabsList>

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
                    const buCount = businessUnits?.filter(bu => bu.division_id === div.id).length || 0;
                    return (
                      <TableRow key={div.id}>
                        <TableCell className="font-medium">{div.name}</TableCell>
                        <TableCell>{renderCodeCell('division', div.id, div.code)}</TableCell>
                        <TableCell>{buCount}</TableCell>
                        <TableCell>
                          {hasEmployees ? (
                            <Badge variant="secondary">In Use</Badge>
                          ) : (
                            <Badge variant="outline">Unused</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {!hasEmployees && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => confirmDelete('division', div.id, div.name)}
                            >
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
                  {businessUnits?.map(bu => {
                    const hasEmployees = busWithEmployees.has(bu.id);
                    const deptCount = departments?.filter(d => d.business_unit_id === bu.id).length || 0;
                    return (
                      <TableRow key={bu.id}>
                        <TableCell className="font-medium">{bu.name}</TableCell>
                        <TableCell>{renderCodeCell('bu', bu.id, bu.code)}</TableCell>
                        <TableCell>{(bu.divisions as any)?.name || '-'}</TableCell>
                        <TableCell>{deptCount}</TableCell>
                        <TableCell>
                          {hasEmployees ? (
                            <Badge variant="secondary">In Use</Badge>
                          ) : (
                            <Badge variant="outline">Unused</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {!hasEmployees && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => confirmDelete('bu', bu.id, bu.name)}
                            >
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
                  {departments?.map(dept => {
                    const empCount = employeeCountByDept.get(dept.id) || 0;
                    const hasEmployees = empCount > 0;
                    const sbCount = subBranches?.filter(sb => sb.department_id === dept.id).length || 0;
                    return (
                      <TableRow key={dept.id}>
                        <TableCell className="font-medium">{dept.name}</TableCell>
                        <TableCell>{renderCodeCell('department', dept.id, dept.code)}</TableCell>
                        <TableCell>{(dept.business_units as any)?.name || '-'}</TableCell>
                        <TableCell>{sbCount}</TableCell>
                        <TableCell>
                          {hasEmployees ? (
                            <Badge variant="secondary">{empCount} employees</Badge>
                          ) : (
                            <Badge variant="outline">Unused</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {!hasEmployees && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => confirmDelete('department', dept.id, dept.name)}
                            >
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
                  {subBranches?.map(sb => (
                    <TableRow key={sb.id}>
                      <TableCell className="font-medium">{sb.name}</TableCell>
                      <TableCell>{renderCodeCell('sub-branch', sb.id, sb.code)}</TableCell>
                      <TableCell>{(sb.departments as any)?.name || '-'}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => confirmDelete('sub-branch', sb.id, sb.name)}
                        >
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
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => confirmDelete('designation', d.id, d.name)}
                        >
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
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => confirmDelete('pms-grade', g.id, g.name)}
                        >
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

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Add {dialogType === 'bu' ? 'Business Unit' : dialogType === 'sub-branch' ? 'Sub-Branch' : dialogType === 'pms-grade' ? 'PMS Grade' : dialogType.charAt(0).toUpperCase() + dialogType.slice(1)}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Enter name"
              />
            </div>

            <div className="space-y-2">
              <Label>Code</Label>
              <Input
                value={formCode}
                onChange={(e) => setFormCode(e.target.value)}
                placeholder="Enter code (optional)"
              />
            </div>

            {dialogType === 'bu' && (
              <div className="space-y-2">
                <Label>Division</Label>
                <Select value={formParentId} onValueChange={setFormParentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select division" />
                  </SelectTrigger>
                  <SelectContent>
                    {divisions?.map(d => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {dialogType === 'department' && (
              <div className="space-y-2">
                <Label>Business Unit</Label>
                <Select value={formParentId} onValueChange={setFormParentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select business unit" />
                  </SelectTrigger>
                  <SelectContent>
                    {businessUnits?.map(bu => (
                      <SelectItem key={bu.id} value={bu.id}>{bu.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {dialogType === 'sub-branch' && (
              <div className="space-y-2">
                <Label>Department</Label>
                <Select value={formParentId} onValueChange={setFormParentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments?.map(d => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
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
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteEntity.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
