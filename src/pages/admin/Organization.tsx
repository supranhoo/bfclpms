import { useState } from 'react';
import { useDivisions, useBusinessUnits, useDepartments, useSubBranches } from '@/hooks/useOrganization';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Building2, Plus, Edit2, Trash2 } from 'lucide-react';

export default function Organization() {
  const { data: divisions, isLoading: divisionsLoading } = useDivisions();
  const { data: businessUnits, isLoading: busLoading } = useBusinessUnits();
  const { data: departments, isLoading: deptsLoading } = useDepartments();
  const { data: subBranches, isLoading: subLoading } = useSubBranches();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState<'division' | 'bu' | 'department' | 'sub-branch'>('division');
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formParentId, setFormParentId] = useState('');

  const createEntity = useMutation({
    mutationFn: async ({ type, name, code, parentId }: { type: string; name: string; code: string; parentId?: string }) => {
      let table = '';
      let data: any = { name, code };

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
      }

      const { error } = await supabase.from(table as any).insert(data);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['divisions'] });
      queryClient.invalidateQueries({ queryKey: ['business-units'] });
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      queryClient.invalidateQueries({ queryKey: ['sub-branches'] });
      toast({ title: 'Created successfully' });
      setDialogOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to create', description: error.message, variant: 'destructive' });
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

  const isLoading = divisionsLoading || busLoading || deptsLoading || subLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Organization Structure</h1>
        <p className="text-muted-foreground">Manage divisions, business units, departments, and sub-branches</p>
      </div>

      <Tabs defaultValue="divisions">
        <TabsList>
          <TabsTrigger value="divisions">Divisions ({divisions?.length || 0})</TabsTrigger>
          <TabsTrigger value="business-units">Business Units ({businessUnits?.length || 0})</TabsTrigger>
          <TabsTrigger value="departments">Departments ({departments?.length || 0})</TabsTrigger>
          <TabsTrigger value="sub-branches">Sub-Branches ({subBranches?.length || 0})</TabsTrigger>
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {divisions?.map(div => (
                    <TableRow key={div.id}>
                      <TableCell className="font-medium">{div.name}</TableCell>
                      <TableCell>{div.code || '-'}</TableCell>
                      <TableCell>{businessUnits?.filter(bu => bu.division_id === div.id).length || 0}</TableCell>
                    </TableRow>
                  ))}
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {businessUnits?.map(bu => (
                    <TableRow key={bu.id}>
                      <TableCell className="font-medium">{bu.name}</TableCell>
                      <TableCell>{bu.code || '-'}</TableCell>
                      <TableCell>{(bu.divisions as any)?.name || '-'}</TableCell>
                      <TableCell>{departments?.filter(d => d.business_unit_id === bu.id).length || 0}</TableCell>
                    </TableRow>
                  ))}
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {departments?.map(dept => (
                    <TableRow key={dept.id}>
                      <TableCell className="font-medium">{dept.name}</TableCell>
                      <TableCell>{dept.code || '-'}</TableCell>
                      <TableCell>{(dept.business_units as any)?.name || '-'}</TableCell>
                      <TableCell>{subBranches?.filter(sb => sb.department_id === dept.id).length || 0}</TableCell>
                    </TableRow>
                  ))}
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subBranches?.map(sb => (
                    <TableRow key={sb.id}>
                      <TableCell className="font-medium">{sb.name}</TableCell>
                      <TableCell>{sb.code || '-'}</TableCell>
                      <TableCell>{(sb.departments as any)?.name || '-'}</TableCell>
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
              Add {dialogType === 'bu' ? 'Business Unit' : dialogType === 'sub-branch' ? 'Sub-Branch' : dialogType.charAt(0).toUpperCase() + dialogType.slice(1)}
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
    </div>
  );
}
