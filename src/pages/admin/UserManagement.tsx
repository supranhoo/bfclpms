import { useState } from 'react';
import { useProfiles } from '@/hooks/useOrganization';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Users, Search, Shield, Edit2 } from 'lucide-react';

type AppRole = 'admin' | 'manager' | 'employee' | 'auditor';

const roleColors = {
  admin: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  manager: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  employee: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  auditor: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
};

export default function UserManagement() {
  const { data: profiles, isLoading } = useProfiles();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<typeof profiles extends (infer T)[] ? T : never | null>(null);
  const [editRole, setEditRole] = useState<AppRole>('employee');
  const [editManagerId, setEditManagerId] = useState<string>('');
  const [editDepartmentId, setEditDepartmentId] = useState<string>('');
  const [editDesignation, setEditDesignation] = useState('');
  const [editPmsGrade, setEditPmsGrade] = useState('');

  const filteredProfiles = profiles?.filter(p => 
    p.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.employee_code?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const updateUser = useMutation({
    mutationFn: async ({
      userId,
      role,
      reportingManagerId,
      designation,
      pmsGrade,
    }: {
      userId: string;
      role: AppRole;
      reportingManagerId: string | null;
      designation: string;
      pmsGrade: string;
    }) => {
      // Update profile
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          reporting_manager_id: reportingManagerId || null,
          designation,
          pms_grade: pmsGrade,
        })
        .eq('id', userId);

      if (profileError) throw profileError;

      // Update role
      const { error: roleError } = await supabase
        .from('user_roles')
        .update({ role })
        .eq('user_id', userId);

      if (roleError) throw roleError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      toast({ title: 'User updated successfully' });
      setEditDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update user', description: error.message, variant: 'destructive' });
    },
  });

  const openEditDialog = (user: NonNullable<typeof profiles>[number]) => {
    setSelectedUser(user);
    const userRole = (user.user_roles as any)?.[0]?.role || 'employee';
    setEditRole(userRole);
    setEditManagerId(user.reporting_manager_id || '');
    setEditDesignation(user.designation || '');
    setEditPmsGrade(user.pms_grade || '');
    setEditDialogOpen(true);
  };

  const handleSaveUser = () => {
    if (!selectedUser) return;
    updateUser.mutate({
      userId: selectedUser.id,
      role: editRole,
      reportingManagerId: editManagerId || null,
      designation: editDesignation,
      pmsGrade: editPmsGrade,
    });
  };

  const getInitials = (name: string | null) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  // Stats
  const totalUsers = profiles?.length || 0;
  const admins = profiles?.filter(p => (p.user_roles as any)?.[0]?.role === 'admin').length || 0;
  const managers = profiles?.filter(p => (p.user_roles as any)?.[0]?.role === 'manager').length || 0;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">User Management</h1>
        <p className="text-muted-foreground">Manage users, roles, and reporting structure</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalUsers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Admins</CardTitle>
            <Shield className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">{admins}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Managers</CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">{managers}</div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Users</CardTitle>
          <CardDescription>{filteredProfiles?.length || 0} users found</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Employee Code</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Designation</TableHead>
                <TableHead>PMS Grade</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Reporting To</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProfiles?.map(profile => {
                const role = (profile.user_roles as any)?.[0]?.role || 'employee';
                const manager = profiles?.find(p => p.id === profile.reporting_manager_id);
                return (
                  <TableRow key={profile.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={profile.avatar_url || undefined} />
                          <AvatarFallback className="text-xs">{getInitials(profile.full_name)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{profile.full_name}</p>
                          <p className="text-xs text-muted-foreground">{profile.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{profile.employee_code || '-'}</TableCell>
                    <TableCell>{(profile.departments as any)?.name || '-'}</TableCell>
                    <TableCell>{profile.designation || '-'}</TableCell>
                    <TableCell>{profile.pms_grade || '-'}</TableCell>
                    <TableCell>
                      <Badge className={roleColors[role as AppRole]}>{role}</Badge>
                    </TableCell>
                    <TableCell>{manager?.full_name || '-'}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => openEditDialog(profile)}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>{selectedUser?.full_name}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={editRole} onValueChange={(v) => setEditRole(v as AppRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">Employee</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="auditor">Auditor</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Reporting Manager</Label>
              <Select value={editManagerId} onValueChange={setEditManagerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select manager" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {profiles?.filter(p => p.id !== selectedUser?.id).map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Designation</Label>
              <Input
                value={editDesignation}
                onChange={(e) => setEditDesignation(e.target.value)}
                placeholder="e.g. Senior Developer"
              />
            </div>

            <div className="space-y-2">
              <Label>PMS Grade</Label>
              <Input
                value={editPmsGrade}
                onChange={(e) => setEditPmsGrade(e.target.value)}
                placeholder="e.g. L4"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveUser} disabled={updateUser.isPending}>
              {updateUser.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
