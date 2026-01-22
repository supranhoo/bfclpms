import { useState, useMemo } from 'react';
import { useProfiles, useDepartments } from '@/hooks/useOrganization';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { UserManagementSkeleton } from '@/components/ui/LoadingSkeletons';
import { Checkbox } from '@/components/ui/checkbox';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Users, Search, Shield, Edit2, Plus, ChevronLeft, ChevronRight, UserPlus, KeyRound, Copy, Check, Trash2, Package } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { SmartAssignmentDialog } from '@/components/admin/SmartAssignmentDialog';

type AppRole = 'admin' | 'manager' | 'employee' | 'auditor' | 'management';

const roleColors: Record<AppRole, string> = {
  admin: 'bg-destructive/10 text-destructive',
  manager: 'bg-primary/10 text-primary',
  employee: 'bg-secondary text-secondary-foreground',
  auditor: 'bg-accent text-accent-foreground',
  management: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
};

const ITEMS_PER_PAGE = 10;

export default function UserManagement() {
  const { data: profiles, isLoading } = useProfiles();
  const { data: departments } = useDepartments();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);

  // Selection
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

  // Edit Dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<NonNullable<typeof profiles>[number] | null>(null);
  const [editRole, setEditRole] = useState<AppRole>('employee');
  const [editManagerId, setEditManagerId] = useState<string>('');
  const [editDepartmentId, setEditDepartmentId] = useState<string>('');
  const [editDesignation, setEditDesignation] = useState('');
  const [editPmsGrade, setEditPmsGrade] = useState('');
  const [editEmployeeCode, setEditEmployeeCode] = useState('');

  // Create Dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newFullName, setNewFullName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newEmployeeCode, setNewEmployeeCode] = useState('');
  const [newRole, setNewRole] = useState<AppRole>('employee');
  const [newDepartmentId, setNewDepartmentId] = useState('');
  const [newDesignation, setNewDesignation] = useState('');
  const [newPmsGrade, setNewPmsGrade] = useState('');
  const [newManagerId, setNewManagerId] = useState('');

  // Bulk Action Dialog
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkRole, setBulkRole] = useState<string>('');
  const [bulkManagerId, setBulkManagerId] = useState<string>('');

  // Password Reset Dialog
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetUserEmail, setResetUserEmail] = useState('');
  const [resetUserName, setResetUserName] = useState('');
  const [resetLink, setResetLink] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);
  const [resetMode, setResetMode] = useState<'link' | 'password'>('link');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [confirmUserPassword, setConfirmUserPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // Delete Dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  // Smart Assignment Dialog (unified bundle + template assignment)
  const [smartAssignDialogOpen, setSmartAssignDialogOpen] = useState(false);
  const [assignTargetUser, setAssignTargetUser] = useState<{ 
    id: string; 
    name: string; 
    departmentId: string | null;
    role: string;
  } | null>(null);

  // Filtered and paginated profiles
  const filteredProfiles = useMemo(() => {
    return profiles?.filter(p => {
      const matchesSearch = 
        p.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.employee_code?.toLowerCase().includes(searchQuery.toLowerCase());
      
      const role = (p.user_roles as any)?.[0]?.role || 'employee';
      const matchesRole = roleFilter === 'all' || role === roleFilter;
      
      const matchesDepartment = departmentFilter === 'all' || p.department_id === departmentFilter;
      
      return matchesSearch && matchesRole && matchesDepartment;
    }) || [];
  }, [profiles, searchQuery, roleFilter, departmentFilter]);

  const totalPages = Math.ceil(filteredProfiles.length / ITEMS_PER_PAGE);
  const paginatedProfiles = filteredProfiles.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Reset to first page when filters change
  const handleFilterChange = () => {
    setCurrentPage(1);
    setSelectedUserIds(new Set());
  };

  // Update user mutation
  const updateUser = useMutation({
    mutationFn: async ({
      userId,
      role,
      reportingManagerId,
      departmentId,
      designation,
      pmsGrade,
      employeeCode,
    }: {
      userId: string;
      role: AppRole;
      reportingManagerId: string | null;
      departmentId: string | null;
      designation: string;
      pmsGrade: string;
      employeeCode: string;
    }) => {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          reporting_manager_id: reportingManagerId || null,
          department_id: departmentId || null,
          designation,
          pms_grade: pmsGrade,
          employee_code: employeeCode || null,
        })
        .eq('id', userId);

      if (profileError) throw profileError;

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

  // Create user mutation
  const createUser = useMutation({
    mutationFn: async (data: {
      full_name: string;
      email: string;
      employee_code: string;
      role: AppRole;
      department_id?: string;
      designation?: string;
      pms_grade?: string;
      reporting_manager_id?: string;
    }) => {
      const { data: session } = await supabase.auth.getSession();
      
      const response = await supabase.functions.invoke('create-employee', {
        body: {
          full_name: data.full_name,
          email: data.email || undefined,
          employee_code: data.employee_code,
          department_id: data.department_id || undefined,
          designation: data.designation || undefined,
          pms_grade: data.pms_grade || undefined,
          reporting_manager_id: data.reporting_manager_id || undefined,
        },
      });

      if (response.error) throw new Error(response.error.message);
      
      // Update role if not employee (default)
      if (data.role !== 'employee' && response.data?.profile?.id) {
        const { error: roleError } = await supabase
          .from('user_roles')
          .update({ role: data.role })
          .eq('user_id', response.data.profile.id);
        
        if (roleError) throw roleError;
      }

      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      toast({ title: 'User created successfully' });
      setCreateDialogOpen(false);
      
      // Open Smart Assignment Dialog for newly created user
      if (data?.profile?.id) {
        setAssignTargetUser({ 
          id: data.profile.id, 
          name: newFullName,
          departmentId: newDepartmentId || null,
          role: newRole,
        });
        setSmartAssignDialogOpen(true);
      }
      
      resetCreateForm();
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to create user', description: error.message, variant: 'destructive' });
    },
  });

  // Bulk update mutation
  const bulkUpdateUsers = useMutation({
    mutationFn: async ({ userIds, role, managerId }: { userIds: string[]; role?: AppRole; managerId?: string | null }) => {
      for (const userId of userIds) {
        if (role) {
          const { error: roleError } = await supabase
            .from('user_roles')
            .update({ role })
            .eq('user_id', userId);
          if (roleError) throw roleError;
        }
        if (managerId !== undefined) {
          const { error: profileError } = await supabase
            .from('profiles')
            .update({ reporting_manager_id: managerId || null })
            .eq('id', userId);
          if (profileError) throw profileError;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      toast({ title: `Updated ${selectedUserIds.size} users successfully` });
      setBulkDialogOpen(false);
      setSelectedUserIds(new Set());
      setBulkRole('');
      setBulkManagerId('');
    },
    onError: (error: Error) => {
      toast({ title: 'Bulk update failed', description: error.message, variant: 'destructive' });
    },
  });

  // Password reset mutation (generate link)
  const resetPassword = useMutation({
    mutationFn: async (email: string) => {
      const response = await supabase.functions.invoke('reset-password', {
        body: { email, action: 'generate_link' },
      });
      if (response.error) throw new Error(response.error.message);
      return response.data;
    },
    onSuccess: (data) => {
      if (data.resetLink) {
        setResetLink(data.resetLink);
      }
      toast({ title: 'Password reset link generated' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to generate reset link', description: error.message, variant: 'destructive' });
    },
  });

  // Set new password mutation (direct update)
  const setNewPassword = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const response = await supabase.functions.invoke('reset-password', {
        body: { email, newPassword: password, action: 'set_password' },
      });
      if (response.error) throw new Error(response.error.message);
      if (response.data?.error) throw new Error(response.data.error);
      return response.data;
    },
    onSuccess: () => {
      toast({ title: 'Password updated successfully' });
      setResetDialogOpen(false);
      resetPasswordDialog();
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update password', description: error.message, variant: 'destructive' });
    },
  });

  // Delete user mutation
  const deleteUser = useMutation({
    mutationFn: async (userId: string) => {
      // Delete user roles first
      const { error: roleError } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId);
      if (roleError) throw roleError;

      // Delete profile
      const { error: profileError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', userId);
      if (profileError) throw profileError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      toast({ title: 'Employee removed successfully' });
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to remove employee', description: error.message, variant: 'destructive' });
    },
  });

  const openEditDialog = (user: NonNullable<typeof profiles>[number]) => {
    setSelectedUser(user);
    const userRole = (user.user_roles as any)?.[0]?.role || 'employee';
    setEditRole(userRole);
    setEditManagerId(user.reporting_manager_id || '');
    setEditDepartmentId(user.department_id || '');
    setEditDesignation(user.designation || '');
    setEditPmsGrade(user.pms_grade || '');
    setEditEmployeeCode(user.employee_code || '');
    setEditDialogOpen(true);
  };

  const handleSaveUser = () => {
    if (!selectedUser) return;
    updateUser.mutate({
      userId: selectedUser.id,
      role: editRole,
      reportingManagerId: editManagerId === 'none' ? null : editManagerId || null,
      departmentId: editDepartmentId === 'none' ? null : editDepartmentId || null,
      designation: editDesignation,
      pmsGrade: editPmsGrade,
      employeeCode: editEmployeeCode,
    });
  };

  const handleCreateUser = () => {
    if (!newFullName || !newEmployeeCode) {
      toast({ title: 'Full name and employee code are required', variant: 'destructive' });
      return;
    }
    createUser.mutate({
      full_name: newFullName,
      email: newEmail,
      employee_code: newEmployeeCode,
      role: newRole,
      department_id: newDepartmentId || undefined,
      designation: newDesignation || undefined,
      pms_grade: newPmsGrade || undefined,
      reporting_manager_id: newManagerId || undefined,
    });
  };

  const resetCreateForm = () => {
    setNewFullName('');
    setNewEmail('');
    setNewEmployeeCode('');
    setNewRole('employee');
    setNewDepartmentId('');
    setNewDesignation('');
    setNewPmsGrade('');
    setNewManagerId('');
  };

  const handleBulkUpdate = () => {
    if (selectedUserIds.size === 0) return;
    bulkUpdateUsers.mutate({
      userIds: Array.from(selectedUserIds),
      role: bulkRole as AppRole || undefined,
      managerId: bulkManagerId === 'none' ? null : bulkManagerId || undefined,
    });
  };

  const openResetDialog = (user: NonNullable<typeof profiles>[number]) => {
    setResetUserEmail(user.email);
    setResetUserName(user.full_name || user.email);
    resetPasswordDialog();
    setResetDialogOpen(true);
  };

  const resetPasswordDialog = () => {
    setResetLink('');
    setLinkCopied(false);
    setResetMode('link');
    setNewUserPassword('');
    setConfirmUserPassword('');
    setPasswordError('');
  };

  const handleResetPassword = () => {
    resetPassword.mutate(resetUserEmail);
  };

  const handleSetNewPassword = () => {
    setPasswordError('');
    
    if (newUserPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      return;
    }
    
    if (newUserPassword !== confirmUserPassword) {
      setPasswordError('Passwords do not match');
      return;
    }
    
    setNewPassword.mutate({ email: resetUserEmail, password: newUserPassword });
  };

  const copyResetLink = async () => {
    await navigator.clipboard.writeText(resetLink);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const confirmDelete = (userId: string, name: string) => {
    setDeleteTarget({ id: userId, name });
    setDeleteDialogOpen(true);
  };

  const handleDelete = () => {
    if (deleteTarget) {
      deleteUser.mutate(deleteTarget.id);
    }
  };

  const toggleSelectAll = () => {
    if (selectedUserIds.size === paginatedProfiles.length) {
      setSelectedUserIds(new Set());
    } else {
      setSelectedUserIds(new Set(paginatedProfiles.map(p => p.id)));
    }
  };

  const toggleSelectUser = (userId: string) => {
    const newSet = new Set(selectedUserIds);
    if (newSet.has(userId)) {
      newSet.delete(userId);
    } else {
      newSet.add(userId);
    }
    setSelectedUserIds(newSet);
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
    return <UserManagementSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">User Management</h1>
          <p className="text-muted-foreground">Manage users, roles, and reporting structure</p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add User
        </Button>
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
            <Shield className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-destructive">{admins}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Managers</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">{managers}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); handleFilterChange(); }}
          />
        </div>
        <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); handleFilterChange(); }}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Filter by role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="manager">Manager</SelectItem>
            <SelectItem value="employee">Employee</SelectItem>
            <SelectItem value="auditor">Auditor</SelectItem>
            <SelectItem value="management">Management</SelectItem>
          </SelectContent>
        </Select>
        <Select value={departmentFilter} onValueChange={(v) => { setDepartmentFilter(v); handleFilterChange(); }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {departments?.map(d => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedUserIds.size > 0 && (
          <Button variant="secondary" onClick={() => setBulkDialogOpen(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Bulk Update ({selectedUserIds.size})
          </Button>
        )}
      </div>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Users</CardTitle>
          <CardDescription>
            Showing {paginatedProfiles.length} of {filteredProfiles.length} users
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={paginatedProfiles.length > 0 && selectedUserIds.size === paginatedProfiles.length}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
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
              {paginatedProfiles.map(profile => {
                const role = (profile.user_roles as any)?.[0]?.role || 'employee';
                const manager = profiles?.find(p => p.id === profile.reporting_manager_id);
                return (
                  <TableRow key={profile.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedUserIds.has(profile.id)}
                        onCheckedChange={() => toggleSelectUser(profile.id)}
                      />
                    </TableCell>
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
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEditDialog(profile)} title="Edit">
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          onClick={() => {
                            const role = (profile.user_roles as any)?.[0]?.role || 'employee';
                            setAssignTargetUser({
                              id: profile.id,
                              name: profile.full_name || profile.email,
                              departmentId: profile.department_id,
                              role,
                            });
                            setSmartAssignDialogOpen(true);
                          }} 
                          title="Assign KRAs"
                        >
                          <Package className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => openResetDialog(profile)} title="Reset Password">
                          <KeyRound className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => confirmDelete(profile.id, profile.full_name || profile.email)}
                          title="Remove Employee"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
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
              <Label>Employee Code</Label>
              <Input
                value={editEmployeeCode}
                onChange={(e) => setEditEmployeeCode(e.target.value)}
                placeholder="e.g. EMP001"
              />
            </div>

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
                  <SelectItem value="management">Management</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Department</Label>
              <Select value={editDepartmentId} onValueChange={setEditDepartmentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {departments?.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
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
                  <SelectItem value="none">None</SelectItem>
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

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
            <DialogDescription>Create a new user account</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              <Label>Full Name *</Label>
              <Input
                value={newFullName}
                onChange={(e) => setNewFullName(e.target.value)}
                placeholder="John Doe"
              />
            </div>

            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="john@example.com"
              />
            </div>

            <div className="space-y-2">
              <Label>Employee Code *</Label>
              <Input
                value={newEmployeeCode}
                onChange={(e) => setNewEmployeeCode(e.target.value)}
                placeholder="EMP001"
              />
            </div>

            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={newRole} onValueChange={(v) => setNewRole(v as AppRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">Employee</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="auditor">Auditor</SelectItem>
                  <SelectItem value="management">Management</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Department</Label>
              <Select value={newDepartmentId} onValueChange={setNewDepartmentId}>
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

            <div className="space-y-2">
              <Label>Designation</Label>
              <Input
                value={newDesignation}
                onChange={(e) => setNewDesignation(e.target.value)}
                placeholder="e.g. Senior Developer"
              />
            </div>

            <div className="space-y-2">
              <Label>PMS Grade</Label>
              <Input
                value={newPmsGrade}
                onChange={(e) => setNewPmsGrade(e.target.value)}
                placeholder="e.g. L4"
              />
            </div>

            <div className="space-y-2">
              <Label>Reporting Manager</Label>
              <Select value={newManagerId} onValueChange={setNewManagerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select manager" />
                </SelectTrigger>
                <SelectContent>
                  {profiles?.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateDialogOpen(false); resetCreateForm(); }}>Cancel</Button>
            <Button onClick={handleCreateUser} disabled={createUser.isPending}>
              {createUser.isPending ? 'Creating...' : 'Create User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Update Dialog */}
      <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk Update Users</DialogTitle>
            <DialogDescription>Update {selectedUserIds.size} selected users</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Change Role (optional)</Label>
              <Select value={bulkRole} onValueChange={setBulkRole}>
                <SelectTrigger>
                  <SelectValue placeholder="Keep existing roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">Employee</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="auditor">Auditor</SelectItem>
                  <SelectItem value="management">Management</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Change Reporting Manager (optional)</Label>
              <Select value={bulkManagerId} onValueChange={setBulkManagerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Keep existing managers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Remove Manager</SelectItem>
                  {profiles?.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDialogOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleBulkUpdate} 
              disabled={bulkUpdateUsers.isPending || (!bulkRole && !bulkManagerId)}
            >
              {bulkUpdateUsers.isPending ? 'Updating...' : 'Update Users'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Password Reset Dialog */}
      <Dialog open={resetDialogOpen} onOpenChange={(open) => { setResetDialogOpen(open); if (!open) resetPasswordDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>Reset password for {resetUserName}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Mode Selection Tabs */}
            <div className="flex border-b">
              <button
                type="button"
                className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
                  resetMode === 'link' 
                    ? 'border-primary text-primary' 
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setResetMode('link')}
              >
                Generate Reset Link
              </button>
              <button
                type="button"
                className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
                  resetMode === 'password' 
                    ? 'border-primary text-primary' 
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setResetMode('password')}
              >
                Set New Password
              </button>
            </div>

            {resetMode === 'link' ? (
              <>
                {!resetLink ? (
                  <p className="text-sm text-muted-foreground">
                    Generate a one-time password reset link to share with the user.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <Label>Reset Link</Label>
                    <div className="flex gap-2">
                      <Input value={resetLink} readOnly className="text-xs" />
                      <Button size="icon" variant="outline" onClick={copyResetLink}>
                        {linkCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Share this link with the user. It can only be used once.
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Directly set a new password for this user.
                </p>
                <div className="space-y-2">
                  <Label>New Password</Label>
                  <Input
                    type="password"
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    placeholder="Enter new password (min 6 characters)"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Confirm Password</Label>
                  <Input
                    type="password"
                    value={confirmUserPassword}
                    onChange={(e) => setConfirmUserPassword(e.target.value)}
                    placeholder="Confirm new password"
                  />
                </div>
                {passwordError && (
                  <p className="text-sm text-destructive">{passwordError}</p>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setResetDialogOpen(false)}>Close</Button>
            {resetMode === 'link' ? (
              !resetLink && (
                <Button onClick={handleResetPassword} disabled={resetPassword.isPending}>
                  {resetPassword.isPending ? 'Generating...' : 'Generate Reset Link'}
                </Button>
              )
            ) : (
              <Button 
                onClick={handleSetNewPassword} 
                disabled={setNewPassword.isPending || !newUserPassword || !confirmUserPassword}
              >
                {setNewPassword.isPending ? 'Updating...' : 'Update Password'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Employee</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{deleteTarget?.name}</strong>? This action cannot be undone and will also delete all associated KPIs, reviews, and audit logs.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteUser.isPending ? 'Removing...' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Smart Assignment Dialog (unified bundle + template assignment) */}
      {assignTargetUser && (
        <SmartAssignmentDialog
          isOpen={smartAssignDialogOpen}
          onClose={() => {
            setSmartAssignDialogOpen(false);
            setAssignTargetUser(null);
          }}
          employeeId={assignTargetUser.id}
          employeeName={assignTargetUser.name}
          employeeDepartmentId={assignTargetUser.departmentId}
          employeeRole={assignTargetUser.role}
        />
      )}
    </div>
  );
}
