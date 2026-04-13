import { useState, useMemo } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useProfiles, useDepartments, useDesignations, usePmsGrades, useDivisions, useBusinessUnits } from '@/hooks/useOrganization';
import { useCompanies } from '@/hooks/useCompanies';
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
import { Switch } from '@/components/ui/switch';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Users, Search, Shield, Edit2, Plus, ChevronLeft, ChevronRight, UserPlus, KeyRound, Copy, Check, Trash2, Package, Calendar, Phone, UserX, UserCheck } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { SmartAssignmentDialog } from '@/components/admin/SmartAssignmentDialog';
import { EmployeeWorkingDaysDialog } from '@/components/admin/EmployeeWorkingDaysDialog';
import { ManagerCombobox, formatManagerLabel } from '@/components/admin/ManagerCombobox';

import { ALL_APP_ROLES, type AppRole } from '@/lib/roles';

const roleColors: Record<AppRole, string> = {
  admin: 'bg-destructive/10 text-destructive',
  manager: 'bg-primary/10 text-primary',
  employee: 'bg-secondary text-secondary-foreground',
  auditor: 'bg-accent text-accent-foreground',
  management: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  hr_pms: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
  skip_level: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
};

const ROLE_LABELS: Record<AppRole, string> = {
  admin: 'Admin',
  manager: 'Manager',
  employee: 'Employee',
  auditor: 'Auditor',
  management: 'Management',
  hr_pms: 'HR PMS',
  skip_level: 'Skip Level',
};

const ITEMS_PER_PAGE = 10;

export default function UserManagement() {
  const isMobile = useIsMobile();
  const { data: profiles, isLoading } = useProfiles();
  const { data: departments } = useDepartments();
  const { data: designationsList } = useDesignations();
  const { data: pmsGradesList } = usePmsGrades();
  const { data: divisions } = useDivisions();
  const { data: businessUnits } = useBusinessUnits();
  const { data: companiesList } = useCompanies();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('active');
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
  const [editFullName, setEditFullName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editMobile, setEditMobile] = useState('');
  const [editIsActive, setEditIsActive] = useState(true);
  const [editDivisionId, setEditDivisionId] = useState('');  // UI-only cascading filter
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
  const [newDivisionId, setNewDivisionId] = useState('');  // UI-only cascading filter
  const [newCompanyId, setNewCompanyId] = useState('');
  const [newPortalAccess, setNewPortalAccess] = useState(true);

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

  // Working Days Dialog
  const [workingDaysDialogOpen, setWorkingDaysDialogOpen] = useState(false);
  const [workingDaysEmployee, setWorkingDaysEmployee] = useState<{
    id: string;
    full_name: string | null;
    email: string;
    employee_code: string | null;
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

      const isActive = (p as any).is_active !== false;
      const matchesStatus = statusFilter === 'all' || 
        (statusFilter === 'active' && isActive) || 
        (statusFilter === 'inactive' && !isActive);
      
      return matchesSearch && matchesRole && matchesDepartment && matchesStatus;
    }) || [];
  }, [profiles, searchQuery, roleFilter, departmentFilter, statusFilter]);

  // Helper: derive division ID from a department ID
  const deriveDivisionFromDept = (deptId: string | null): string => {
    if (!deptId || !departments || !businessUnits) return '';
    const dept = departments.find(d => d.id === deptId);
    const buId = dept?.business_unit_id;
    if (!buId) return '';
    const bu = businessUnits.find(b => b.id === buId);
    return bu?.division_id || '';
  };

  // Filter departments by selected division (for Edit dialog)
  const editFilteredDepartments = useMemo(() => {
    if (!departments) return [];
    if (!editDivisionId) return departments;
    const buIdsInDivision = new Set(businessUnits?.filter(bu => bu.division_id === editDivisionId).map(bu => bu.id));
    return departments.filter(d => d.business_unit_id && buIdsInDivision.has(d.business_unit_id));
  }, [departments, businessUnits, editDivisionId]);

  // Filter departments by selected division (for Create dialog)
  const createFilteredDepartments = useMemo(() => {
    if (!departments) return [];
    if (!newDivisionId) return departments;
    const buIdsInDivision = new Set(businessUnits?.filter(bu => bu.division_id === newDivisionId).map(bu => bu.id));
    return departments.filter(d => d.business_unit_id && buIdsInDivision.has(d.business_unit_id));
  }, [departments, businessUnits, newDivisionId]);

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
      fullName,
      reportingManagerId,
      departmentId,
      designation,
      pmsGrade,
      employeeCode,
      mobileNumber,
      isActive,
    }: {
      userId: string;
      role: AppRole;
      fullName: string;
      reportingManagerId: string | null;
      departmentId: string | null;
      designation: string;
      pmsGrade: string;
      employeeCode: string;
      mobileNumber?: string;
      isActive?: boolean;
    }) => {
      const updatePayload: Record<string, any> = {
        full_name: fullName || null,
        reporting_manager_id: reportingManagerId || null,
        department_id: departmentId || null,
        designation,
        pms_grade: pmsGrade,
        employee_code: employeeCode || null,
        mobile_number: mobileNumber !== undefined ? (mobileNumber || null) : undefined,
      };

      if (isActive !== undefined) {
        updatePayload.is_active = isActive;
        updatePayload.deactivated_at = isActive ? null : new Date().toISOString();
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .update(updatePayload)
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
      company_id?: string;
      portal_access?: boolean;
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
          company_id: data.company_id || undefined,
          portal_access: data.portal_access,
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
    setEditDivisionId(deriveDivisionFromDept(user.department_id));
    setEditDesignation(user.designation || '');
    setEditPmsGrade(user.pms_grade || '');
    setEditEmployeeCode(user.employee_code || '');
    setEditFullName(user.full_name || '');
    setEditEmail(user.email || '');
    setEditMobile((user as any).mobile_number || '');
    setEditIsActive((user as any).is_active !== false);
    setEditDialogOpen(true);
  };

  const handleSaveUser = async () => {
    if (!selectedUser) return;

    // If email changed, update via edge function first
    const emailChanged = editEmail.trim().toLowerCase() !== selectedUser.email.trim().toLowerCase();
    if (emailChanged) {
      try {
        const result = await invokeAdminEdgeFunction<{ success: boolean; message?: string; warning?: string }>(
          'update-user-email',
          { userId: selectedUser.id, newEmail: editEmail.trim() },
        );
        if (result?.warning) {
          toast({ title: 'Email updated with warning', description: result.warning, variant: 'destructive' });
        }
      } catch (err: any) {
        toast({ title: 'Failed to update email', description: err.message, variant: 'destructive' });
        return;
      }
    }

    updateUser.mutate({
      userId: selectedUser.id,
      role: editRole,
      fullName: editFullName,
      reportingManagerId: editManagerId === 'none' ? null : editManagerId || null,
      departmentId: editDepartmentId === 'none' ? null : editDepartmentId || null,
      designation: editDesignation,
      pmsGrade: editPmsGrade,
      employeeCode: editEmployeeCode,
      mobileNumber: editMobile,
      isActive: editIsActive,
    });
  };

  const handleCreateUser = () => {
    if (!newFullName.trim() || !newEmployeeCode.trim()) {
      toast({ title: 'Full name and employee code are required', variant: 'destructive' });
      return;
    }
    if (newEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())) {
      toast({ title: 'Invalid email format', variant: 'destructive' });
      return;
    }
    createUser.mutate({
      full_name: newFullName,
      email: newPortalAccess ? newEmail : '',
      employee_code: newEmployeeCode,
      role: newRole,
      department_id: newDepartmentId || undefined,
      designation: newDesignation || undefined,
      pms_grade: newPmsGrade || undefined,
      reporting_manager_id: newManagerId || undefined,
      company_id: newCompanyId || undefined,
      portal_access: newPortalAccess,
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
    setNewDivisionId('');
    setNewCompanyId('');
    setNewPortalAccess(true);
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
  const activeUsers = profiles?.filter(p => (p as any).is_active !== false).length || 0;
  const inactiveUsers = totalUsers - activeUsers;
  const admins = profiles?.filter(p => (p.user_roles as any)?.[0]?.role === 'admin').length || 0;

  if (isLoading) {
    return <UserManagementSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">User Management</h1>
          <p className="text-sm text-muted-foreground">Manage users, roles, and reporting structure</p>
        </div>
        <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Add User</span>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
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
            <CardTitle className="text-sm font-medium text-muted-foreground">Active</CardTitle>
            <UserCheck className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">{activeUsers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Inactive</CardTitle>
            <UserX className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-muted-foreground">{inactiveUsers}</div>
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
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[180px]">
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
            {ALL_APP_ROLES.map(role => (
              <SelectItem key={role} value={role}>{ROLE_LABELS[role]}</SelectItem>
            ))}
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
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); handleFilterChange(); }}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
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
          {isMobile ? (
            /* Mobile Card View */
            <div className="space-y-3">
              {paginatedProfiles.map(profile => {
                const role = (profile.user_roles as any)?.[0]?.role || 'employee';
                const manager = profiles?.find(p => p.id === profile.reporting_manager_id);
                return (
                  <div key={profile.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={profile.avatar_url || undefined} />
                        <AvatarFallback className="text-xs">{getInitials(profile.full_name)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{profile.full_name}</p>
                        <p className="text-xs text-muted-foreground truncate">{profile.email}</p>
                      </div>
                      <Badge className={roleColors[role as AppRole]}>{role}</Badge>
                      {(profile as any).is_active === false && (
                        <Badge variant="destructive" className="text-xs">Inactive</Badge>
                      )}
                      {(profile as any).portal_access === false && (
                        <Badge variant="secondary" className="text-xs">No Portal</Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                      <span>Code: {profile.employee_code || '-'}</span>
                      <span>Dept: {(profile.departments as any)?.name || '-'}</span>
                      <span>Grade: {profile.pms_grade || '-'}</span>
                      <span>Manager: {manager ? formatManagerLabel(manager.full_name, manager.employee_code) : '-'}</span>
                    </div>
                    <div className="flex items-center gap-1 pt-1 border-t">
                      <Button size="sm" variant="ghost" onClick={() => openEditDialog(profile)} className="min-h-[44px]">
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => {
                        const r = (profile.user_roles as any)?.[0]?.role || 'employee';
                        setAssignTargetUser({ id: profile.id, name: profile.full_name || profile.email, departmentId: profile.department_id, role: r });
                        setSmartAssignDialogOpen(true);
                      }} className="min-h-[44px]">
                        <Package className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => openResetDialog(profile)} className="min-h-[44px]">
                        <KeyRound className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => {
                        setWorkingDaysEmployee({ id: profile.id, full_name: profile.full_name, email: profile.email, employee_code: profile.employee_code });
                        setWorkingDaysDialogOpen(true);
                      }} className="min-h-[44px]">
                        <Calendar className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => confirmDelete(profile.id, profile.full_name || profile.email)} className="min-h-[44px]">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                );
              })}
              {paginatedProfiles.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">No users found</div>
              )}
            </div>
          ) : (
            /* Desktop Table View */
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
                  <TableHead>Mobile</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
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
                        {(profile as any).mobile_number ? (
                          <a
                            href={`tel:${(profile as any).mobile_number}`}
                            className="flex items-center gap-1 text-sm text-foreground hover:text-primary transition-colors"
                            onClick={e => e.stopPropagation()}
                          >
                            <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            {(profile as any).mobile_number}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={roleColors[role as AppRole]}>{role}</Badge>
                      </TableCell>
                      <TableCell>
                        {(profile as any).is_active === false ? (
                          <Badge variant="destructive" className="text-xs">Inactive</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs border-primary/30 text-primary">Active</Badge>
                        )}
                        {(profile as any).portal_access === false && (
                          <Badge variant="secondary" className="text-xs ml-1">No Portal</Badge>
                        )}
                      </TableCell>
                      <TableCell>{manager ? formatManagerLabel(manager.full_name, manager.employee_code) : '-'}</TableCell>
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
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            onClick={() => openResetDialog(profile)} 
                            title="Reset Password"
                          >
                            <KeyRound className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setWorkingDaysEmployee({
                                id: profile.id,
                                full_name: profile.full_name,
                                email: profile.email,
                                employee_code: profile.employee_code,
                              });
                              setWorkingDaysDialogOpen(true);
                            }}
                            title="Working Days"
                          >
                            <Calendar className="h-4 w-4" />
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
          )}

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
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update details for {selectedUser?.full_name}</DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 pr-4 -mr-4">
            <div className="space-y-6 py-4">
              {/* Section: Personal Information */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Personal Information</h3>
                </div>
                <Separator />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Full Name</Label>
                    <Input
                      value={editFullName}
                      onChange={(e) => setEditFullName(e.target.value)}
                      placeholder="e.g. John Doe"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      placeholder="e.g. user@example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Employee Code</Label>
                    <Input
                      value={editEmployeeCode}
                      onChange={(e) => setEditEmployeeCode(e.target.value)}
                      placeholder="e.g. EMP001"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Mobile Number</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="tel"
                        value={editMobile}
                        onChange={(e) => setEditMobile(e.target.value)}
                        placeholder="+91 98765 43210"
                        className="pl-9"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Section: Organization */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Organization</h3>
                </div>
                <Separator />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Division</Label>
                    <Select value={editDivisionId || '__all__'} onValueChange={(val) => {
                      const newDiv = val === '__all__' ? '' : val;
                      setEditDivisionId(newDiv);
                      // Auto-clear department if it doesn't belong to the new division
                      if (newDiv && editDepartmentId && editDepartmentId !== 'none') {
                        const buIdsInDiv = new Set(businessUnits?.filter(bu => bu.division_id === newDiv).map(bu => bu.id));
                        const dept = departments?.find(d => d.id === editDepartmentId);
                        if (dept && dept.business_unit_id && !buIdsInDiv.has(dept.business_unit_id)) {
                          setEditDepartmentId('none');
                        }
                      }
                    }}>
                      <SelectTrigger>
                        <SelectValue placeholder="All divisions" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">All Divisions</SelectItem>
                        {divisions?.map(d => (
                          <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                        ))}
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
                        {editFilteredDepartments.map(d => (
                          <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Designation</Label>
                    <Select value={editDesignation || '__none__'} onValueChange={(val) => setEditDesignation(val === '__none__' ? '' : val)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select designation" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">None</SelectItem>
                        {designationsList?.map(d => (
                          <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>PMS Grade</Label>
                    <Select value={editPmsGrade || '__none__'} onValueChange={(val) => setEditPmsGrade(val === '__none__' ? '' : val)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select PMS grade" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">None</SelectItem>
                        {pmsGradesList?.map(g => (
                          <SelectItem key={g.id} value={g.name}>{g.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Reporting Manager</Label>
                    <ManagerCombobox
                      value={editManagerId}
                      onValueChange={setEditManagerId}
                      profiles={profiles?.filter(p => (p as any).is_active !== false) || []}
                      excludeId={selectedUser?.id}
                      placeholder="Search by name or code..."
                    />
                  </div>
                </div>
              </div>

              {/* Section: Access & Status */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Access & Status</h3>
                </div>
                <Separator />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <Select value={editRole} onValueChange={(v) => setEditRole(v as AppRole)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ALL_APP_ROLES.map(role => (
                          <SelectItem key={role} value={role}>{ROLE_LABELS[role]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-3 h-fit">
                    <div className="space-y-0.5">
                      <Label>Account Status</Label>
                      <p className="text-xs text-muted-foreground">
                        {editIsActive ? 'User can log in and access the system' : 'User is blocked from logging in'}
                      </p>
                    </div>
                    <Switch
                      checked={editIsActive}
                      onCheckedChange={setEditIsActive}
                    />
                  </div>
                </div>
              </div>
            </div>
          </ScrollArea>

          <DialogFooter className="pt-4 border-t">
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveUser} disabled={updateUser.isPending}>
              {updateUser.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
            <DialogDescription>Create a new user account and assign their role</DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 pr-4 -mr-4">
            <div className="space-y-6 py-4">
              {/* Section: Personal Information */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Personal Information</h3>
                </div>
                <Separator />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <div className="space-y-2">
                    <Label>Full Name <span className="text-destructive">*</span></Label>
                    <Input
                      value={newFullName}
                      onChange={(e) => setNewFullName(e.target.value)}
                      placeholder="John Doe"
                    />
                  </div>
                  {newPortalAccess && (
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input
                        type="email"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="john@example.com"
                      />
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label>Employee Code <span className="text-destructive">*</span></Label>
                    <Input
                      value={newEmployeeCode}
                      onChange={(e) => setNewEmployeeCode(e.target.value)}
                      placeholder="EMP001"
                    />
                  </div>
                </div>
              </div>

              {/* Section: Organization */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Organization</h3>
                </div>
                <Separator />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Company</Label>
                    <Select value={newCompanyId || '__none__'} onValueChange={(val) => setNewCompanyId(val === '__none__' ? '' : val)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select company" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">None</SelectItem>
                        {companiesList?.map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Division</Label>
                    <Select value={newDivisionId || '__all__'} onValueChange={(val) => {
                      const newDiv = val === '__all__' ? '' : val;
                      setNewDivisionId(newDiv);
                      if (newDiv && newDepartmentId) {
                        const buIdsInDiv = new Set(businessUnits?.filter(bu => bu.division_id === newDiv).map(bu => bu.id));
                        const dept = departments?.find(d => d.id === newDepartmentId);
                        if (dept && dept.business_unit_id && !buIdsInDiv.has(dept.business_unit_id)) {
                          setNewDepartmentId('');
                        }
                      }
                    }}>
                      <SelectTrigger>
                        <SelectValue placeholder="All divisions" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">All Divisions</SelectItem>
                        {divisions?.map(d => (
                          <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                        ))}
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
                        {createFilteredDepartments.map(d => (
                          <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Designation</Label>
                    <Select value={newDesignation || '__none__'} onValueChange={(val) => setNewDesignation(val === '__none__' ? '' : val)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select designation" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">None</SelectItem>
                        {designationsList?.map(d => (
                          <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>PMS Grade</Label>
                    <Select value={newPmsGrade || '__none__'} onValueChange={(val) => setNewPmsGrade(val === '__none__' ? '' : val)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select PMS grade" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">None</SelectItem>
                        {pmsGradesList?.map(g => (
                          <SelectItem key={g.id} value={g.name}>{g.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Reporting Manager</Label>
                    <ManagerCombobox
                      value={newManagerId}
                      onValueChange={setNewManagerId}
                      profiles={profiles?.filter(p => (p as any).is_active !== false) || []}
                      placeholder="Search by name or code..."
                      showNone={false}
                    />
                  </div>
                </div>
              </div>

              {/* Section: Access */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Access</h3>
                </div>
                <Separator />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <Select value={newRole} onValueChange={(v) => setNewRole(v as AppRole)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ALL_APP_ROLES.map(role => (
                          <SelectItem key={role} value={role}>{ROLE_LABELS[role]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-3 h-fit">
                    <div className="space-y-0.5">
                      <Label>Portal Access</Label>
                      <p className="text-xs text-muted-foreground">
                        {newPortalAccess ? 'User can log in to the portal' : 'Data-only user — no login access'}
                      </p>
                    </div>
                    <Switch
                      checked={newPortalAccess}
                      onCheckedChange={setNewPortalAccess}
                    />
                  </div>
                </div>
              </div>
            </div>
          </ScrollArea>

          <DialogFooter className="pt-4 border-t">
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
                  {ALL_APP_ROLES.map(role => (
                    <SelectItem key={role} value={role}>{ROLE_LABELS[role]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Change Reporting Manager (optional)</Label>
              <ManagerCombobox
                value={bulkManagerId}
                onValueChange={setBulkManagerId}
                profiles={profiles?.filter(p => (p as any).is_active !== false) || []}
                placeholder="Search by name or code..."
                noneLabel="Remove Manager"
              />
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

      {/* Working Days Dialog */}
      <EmployeeWorkingDaysDialog
        isOpen={workingDaysDialogOpen}
        onClose={() => {
          setWorkingDaysDialogOpen(false);
          setWorkingDaysEmployee(null);
        }}
        employee={workingDaysEmployee}
      />
    </div>
  );
}
