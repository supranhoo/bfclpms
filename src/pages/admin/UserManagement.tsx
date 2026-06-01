import { useState, useMemo, useEffect } from 'react';
import { invokeAdminEdgeFunction } from '@/lib/adminEdgeFunction';
import { useIsMobile } from '@/hooks/use-mobile';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { RequiredMark } from '@/components/ui/RequiredMark';
import { useEmployeeMasterFieldRequirements } from '@/hooks/useEmployeeMasterFieldRequirements';
import { validateRequiredFields, type EmployeeMasterFieldKey } from '@/lib/employeeMasterFields';
import {
  useEmployeeMasterCustomFieldDefs,
  saveEmployeeMasterCustomFieldValues,
  useEmployeeMasterCustomFieldValues,
} from '@/hooks/useEmployeeMasterCustomFields';
import {
  validateCustomFieldValues,
  normalizeCustomFieldValues,
  type CustomFieldValues,
} from '@/lib/employeeMasterCustomFields';
import { CustomFieldRenderer } from '@/components/admin/CustomFieldRenderer';
import { useProfiles, useDepartments, useDesignations, usePmsGrades, useDivisions, useBusinessUnits, useEmployeeCategories, useEmploymentStatuses, useLocations } from '@/hooks/useOrganization';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { invalidateProfileCaches } from '@/lib/profileCacheKeys';
import { Users, Search, Shield, Edit2, Plus, ChevronLeft, ChevronRight, UserPlus, KeyRound, Copy, Check, Trash2, Package, Calendar, Phone, UserX, UserCheck, Sparkles, GitBranch } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { SmartAssignmentDialog } from '@/components/admin/SmartAssignmentDialog';
import { EmployeeWorkingDaysDialog } from '@/components/admin/EmployeeWorkingDaysDialog';
import { ManagerCombobox, formatManagerLabel } from '@/components/admin/ManagerCombobox';
import { OrgFilterCombobox } from '@/components/admin/OrgFilterCombobox';
import { UserAccessSheet, type UserAccessSheetTab, type UserAccessSheetUser } from '@/components/admin/UserAccessSheet';
import { BulkGrantAccessDialog, type BulkGrantTarget } from '@/components/admin/BulkGrantAccessDialog';
import { useSearchParams } from 'react-router-dom';

import { ALL_APP_ROLES, type AppRole } from '@/lib/roles';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useMyVisibleEmployeeIds } from '@/hooks/useMyVisibleEmployeeIds';
import { useWorkflowTemplates, useWorkflowConfigs, useUpsertWorkflowConfig, useDeleteWorkflowConfig, getStageLabel } from '@/hooks/useWorkflowConfig';
// v2.67.x — Dummy/System Employee Visibility (admin-side: always shows
// everyone with a badge + filter; never gated by the global setting).
import { useDummyEmployees } from '@/hooks/useDummyEmployees';

// Inline card used inside Edit User → Access & Login to view/change the
// employee's assigned (global) workflow template without leaving the dialog.
function InlineWorkflowMappingCard({ employeeId }: { employeeId: string }) {
  const { toast } = useToast();
  const { data: templates, isLoading: tLoading } = useWorkflowTemplates(false);
  const { data: configs, isLoading: cLoading } = useWorkflowConfigs();
  const upsert = useUpsertWorkflowConfig();
  const remove = useDeleteWorkflowConfig();

  const existing = useMemo(
    () => configs?.find(c => c.config_type === 'employee' && c.config_value === employeeId && !c.review_period) ?? null,
    [configs, employeeId]
  );
  const selectedTemplate = useMemo(
    () => templates?.find(t => t.id === existing?.workflow_template_id) ?? null,
    [templates, existing]
  );

  const loading = tLoading || cLoading;

  const onChange = (value: string) => {
    upsert.mutate(
      { configType: 'employee', configValue: employeeId, workflowTemplateId: value },
      {
        onSuccess: () => toast({ title: 'Workflow assigned', description: 'This user now uses the selected workflow.' }),
        onError: (e: any) => toast({ title: 'Failed to assign workflow', description: e?.message ?? 'Try again.', variant: 'destructive' }),
      }
    );
  };

  const onReset = () => {
    if (!existing) return;
    remove.mutate(existing.id, {
      onSuccess: () => toast({ title: 'Reset to default', description: 'This user now inherits the default workflow.' }),
      onError: (e: any) => toast({ title: 'Failed to reset', description: e?.message ?? 'Try again.', variant: 'destructive' }),
    });
  };

  return (
    <div className="rounded-lg border p-4 md:col-span-2 lg:col-span-1">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <GitBranch className="h-5 w-5 text-primary" />
          <p className="text-sm font-semibold">Workflow mapping</p>
        </div>
        {existing && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={onReset}
            disabled={remove.isPending}
          >
            Reset to default
          </Button>
        )}
      </div>
      <Label className="text-xs text-muted-foreground">Assigned Workflow</Label>
      <Select
        value={existing?.workflow_template_id ?? ''}
        onValueChange={onChange}
        disabled={loading || upsert.isPending}
      >
        <SelectTrigger className="mt-1 h-9">
          <SelectValue placeholder={loading ? 'Loading…' : 'Inherit (default)'} />
        </SelectTrigger>
        <SelectContent>
          {templates?.map(t => (
            <SelectItem key={t.id} value={t.id}>{t.display_name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selectedTemplate && (
        <div className="mt-2 flex flex-wrap gap-1">
          {selectedTemplate.stages.map((s, i) => (
            <span key={`${s}-${i}`} className="inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground bg-muted/40">
              {getStageLabel(s)}
            </span>
          ))}
        </div>
      )}
      {!existing && !loading && (
        <p className="mt-2 text-xs text-muted-foreground">Currently inheriting the default workflow.</p>
      )}
    </div>
  );
}

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
  const navigate = useNavigate();
  const { data: profiles, isLoading } = useProfiles();
  const { data: departments } = useDepartments();
  const { data: designationsList } = useDesignations();
  const { data: pmsGradesList } = usePmsGrades();
  const { data: employeeCategoriesList } = useEmployeeCategories();
  const { data: employmentStatusesList } = useEmploymentStatuses();
  const { data: divisions } = useDivisions();
  const { data: businessUnits } = useBusinessUnits();
  const { data: companiesList } = useCompanies();
  const { data: locationsList } = useLocations();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Employee Master Field Requirements (admin-configurable mandatory flags
  // for the Add New User page).
  const { requirements: emfReqs } = useEmployeeMasterFieldRequirements();
  const ReqMark = ({ k }: { k: EmployeeMasterFieldKey }) =>
    emfReqs[k] ? <RequiredMark /> : null;

  // Admin-defined custom Employee Master fields (active + show_on_add_user).
  const { data: customFieldDefs = [] } = useEmployeeMasterCustomFieldDefs({
    activeOnly: true,
    addUserOnly: true,
  });
  const [customValues, setCustomValues] = useState<CustomFieldValues>({});

  // Edit User custom fields — separate def query (active, scoped to
  // show_on_edit_user) plus per-employee values fetched on demand.
  const { data: editCustomFieldDefsAll = [] } = useEmployeeMasterCustomFieldDefs({
    activeOnly: true,
  });
  const editCustomFieldDefs = useMemo(
    () => editCustomFieldDefsAll.filter((d) => d.show_on_edit_user),
    [editCustomFieldDefsAll],
  );
  const [editCustomValues, setEditCustomValues] = useState<CustomFieldValues>({});
  const { data: editCustomValuesFetched } = useEmployeeMasterCustomFieldValues(
    editDialogOpen ? selectedUser?.id : null,
  );
  useEffect(() => {
    if (editDialogOpen) {
      setEditCustomValues(editCustomValuesFetched || {});
    } else {
      setEditCustomValues({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editDialogOpen, editCustomValuesFetched, selectedUser?.id]);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  // v2.67.x — Dummy/System Employee filter (admin-only; never gated by the
  // global visibility setting because admins must always be able to manage
  // these flags). See POLICY: Dummy/System Employee Visibility.
  const [employeeTypeFilter, setEmployeeTypeFilter] = useState<'all' | 'real' | 'dummy'>('all');

  // Selection
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

  // Edit Dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  // v2.66.12 — Edit dialog re-hydrates 7 columns missing from the slim roster
  // RPC (`get_reviewer_roster_slim`). Without this the form rendered empty
  // placeholders and any subsequent Save would null-overwrite existing data.
  // See POLICY §126 (Slim-RPC Edit Hydration Contract).
  const [editHydrating, setEditHydrating] = useState(false);
  const [selectedUser, setSelectedUser] = useState<NonNullable<typeof profiles>[number] | null>(null);
  const [editRole, setEditRole] = useState<AppRole>('employee');
  const [editManagerId, setEditManagerId] = useState<string>('');
  const [editDepartmentId, setEditDepartmentId] = useState<string>('');
  const [editDesignation, setEditDesignation] = useState('');
  const [editPmsGrade, setEditPmsGrade] = useState('');
  const [editEmployeeCategory, setEditEmployeeCategory] = useState('');
  const [editEmploymentStatus, setEditEmploymentStatus] = useState('');
  const [editEmployeeCode, setEditEmployeeCode] = useState('');
  const [editFullName, setEditFullName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editMobile, setEditMobile] = useState('');
  const [editIsActive, setEditIsActive] = useState(true);
  const [editDivisionId, setEditDivisionId] = useState('');  // UI-only cascading filter
  const [editGroupDoj, setEditGroupDoj] = useState<string>(''); // yyyy-MM-dd or ''
  const [editDoj, setEditDoj] = useState<string>(''); // yyyy-MM-dd or ''
  const [editConfirmationDate, setEditConfirmationDate] = useState<string>(''); // yyyy-MM-dd or ''
  const [editLocationId, setEditLocationId] = useState<string>('');
  const [editIsDummy, setEditIsDummy] = useState<boolean>(false);
  // Create Dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newFullName, setNewFullName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newEmployeeCode, setNewEmployeeCode] = useState('');
  const [newRole, setNewRole] = useState<AppRole>('employee');
  const [newDepartmentId, setNewDepartmentId] = useState('');
  const [newDesignation, setNewDesignation] = useState('');
  const [newPmsGrade, setNewPmsGrade] = useState('');
  const [newEmployeeCategory, setNewEmployeeCategory] = useState('');
  const [newEmploymentStatus, setNewEmploymentStatus] = useState('');
  const [newManagerId, setNewManagerId] = useState('');
  const [newDivisionId, setNewDivisionId] = useState('');  // UI-only cascading filter
  const [newCompanyId, setNewCompanyId] = useState('');
  const [newPortalAccess, setNewPortalAccess] = useState(true);
  const [newGroupDoj, setNewGroupDoj] = useState<string>(''); // yyyy-MM-dd or ''
  const [newDoj, setNewDoj] = useState<string>(''); // yyyy-MM-dd or ''
  const [newConfirmationDate, setNewConfirmationDate] = useState<string>(''); // yyyy-MM-dd or ''
  const [newLocationId, setNewLocationId] = useState<string>('');
  const [newIsDummy, setNewIsDummy] = useState<boolean>(false);

  // Bulk Action Dialog
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkRole, setBulkRole] = useState<string>('');
  const [bulkManagerId, setBulkManagerId] = useState<string>('');

  // Bulk Grant Access Dialog (multi-user × multi-role IAC grants)
  const [bulkGrantOpen, setBulkGrantOpen] = useState(false);

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

  // Manage Access sheet (per-user cockpit: Roles / Password / Audit)
  const [accessUser, setAccessUser] = useState<UserAccessSheetUser | null>(null);
  const [accessTab, setAccessTab] = useState<UserAccessSheetTab>('roles');
  const openAccessSheet = (
    p: NonNullable<typeof profiles>[number],
    tab: UserAccessSheetTab = 'roles',
  ) => {
    setAccessUser({
      id: p.id,
      full_name: p.full_name,
      email: p.email,
      employee_code: p.employee_code,
      has_real_email: (p as any).has_real_email,
      portal_access: (p as any).portal_access,
    });
    setAccessTab(tab);
  };

  // Deep-link: /admin/users?manage=<user_id>[&tab=password|audit|roles]
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const manageId = searchParams.get('manage');
    if (!manageId || !profiles?.length || accessUser) return;
    const target = profiles.find(p => p.id === manageId);
    if (!target) return;
    const tab = (searchParams.get('tab') as UserAccessSheetTab) || 'roles';
    openAccessSheet(target, tab);
  }, [searchParams, profiles, accessUser]);

  // Filtered and paginated profiles
  // POLICY §120: debounce the search term so the 2,533-row in-memory filter
  // does not recompute on every keystroke. Other filters (role/dept/status)
  // are categorical and recompute immediately.
  const debouncedSearch = useDebouncedValue(searchQuery, 300);

  // POLICY §NEW (Access-Profile Org-Scope Visibility):
  // Non-admin viewers who reach this page via an access profile only see
  // employees that match at least one Org Level Scope row mapped to them.
  // Admins receive `visibleIds === null` → no narrowing.
  const { visibleIds, isAdmin: viewerIsAdmin } = useMyVisibleEmployeeIds();

  // Admin-side dummy/system employee map — drives badge + Employee Type filter.
  // Admins ALWAYS see everyone here regardless of the global visibility setting.
  const { dummyIds } = useDummyEmployees();

  const filteredProfiles = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    const scoped = (!viewerIsAdmin && visibleIds)
      ? (profiles ?? []).filter(p => visibleIds.has(p.id))
      : (profiles ?? []);
    const filtered = scoped.filter(p => {
      const matchesSearch = 
        !q ||
        p.full_name?.toLowerCase().includes(q) ||
        p.email?.toLowerCase().includes(q) ||
        p.employee_code?.toLowerCase().includes(q);
      
      const role = (p.user_roles as any)?.[0]?.role || 'employee';
      const matchesRole = roleFilter === 'all' || role === roleFilter;
      
      const matchesDepartment = departmentFilter === 'all' || p.department_id === departmentFilter;

      const isActive = (p as any).is_active !== false;
      const matchesStatus = statusFilter === 'all' || 
        (statusFilter === 'active' && isActive) || 
        (statusFilter === 'inactive' && !isActive);

      const isDummy = dummyIds.has(p.id);
      const matchesType =
        employeeTypeFilter === 'all' ||
        (employeeTypeFilter === 'real' && !isDummy) ||
        (employeeTypeFilter === 'dummy' && isDummy);

      return matchesSearch && matchesRole && matchesDepartment && matchesStatus && matchesType;
    });
    // Sort: active first, then inactive — both alphabetical by full_name
    return [...filtered].sort((a, b) => {
      const aActive = (a as any).is_active !== false ? 0 : 1;
      const bActive = (b as any).is_active !== false ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return (a.full_name || '').localeCompare(b.full_name || '');
    });
  }, [profiles, debouncedSearch, roleFilter, departmentFilter, statusFilter, viewerIsAdmin, visibleIds, employeeTypeFilter, dummyIds]);

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

  // Combobox option lists (memoized) — used by Add/Edit User dialogs
  const companyOptions = useMemo(() => (companiesList || []).map(c => ({ value: c.id, label: c.name })), [companiesList]);
  const divisionOptions = useMemo(() => (divisions || []).map(d => ({ value: d.id, label: d.name })), [divisions]);
  const editDepartmentOptions = useMemo(() => editFilteredDepartments.map(d => ({ value: d.id, label: d.name })), [editFilteredDepartments]);
  const createDepartmentOptions = useMemo(() => createFilteredDepartments.map(d => ({ value: d.id, label: d.name })), [createFilteredDepartments]);
  const designationOptions = useMemo(() => (designationsList || []).map(d => ({ value: d.name, label: d.name })), [designationsList]);
  const pmsGradeOptions = useMemo(() => (pmsGradesList || []).map(g => ({ value: g.name, label: g.name })), [pmsGradesList]);
  const employeeCategoryOptions = useMemo(
    () => (employeeCategoriesList || []).filter((c: any) => c.is_active !== false).map((c: any) => ({ value: c.name, label: c.name })),
    [employeeCategoriesList],
  );
  const employmentStatusOptions = useMemo(
    () => (employmentStatusesList || []).filter((s: any) => s.is_active !== false).map((s: any) => ({ value: s.name, label: s.name })),
    [employmentStatusesList],
  );
  const locationOptions = useMemo(
    () => (locationsList || []).map((l: any) => ({ value: l.id, label: l.name })),
    [locationsList],
  );
  const roleOptions = useMemo(() => ALL_APP_ROLES.map(role => ({ value: role, label: ROLE_LABELS[role] })), []);

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
      employeeCategory,
      employmentStatus,
      employeeCode,
      mobileNumber,
      isActive,
      groupDoj,
      doj,
      confirmationDate,
      locationId,
      isDummyEmployee,
    }: {
      userId: string;
      role: AppRole;
      fullName: string;
      reportingManagerId: string | null;
      departmentId: string | null;
      designation: string;
      pmsGrade: string;
      employeeCategory?: string;
      employmentStatus?: string;
      employeeCode: string;
      mobileNumber?: string;
      isActive?: boolean;
      groupDoj?: string | null;
      doj?: string | null;
      confirmationDate?: string | null;
      locationId?: string | null;
      isDummyEmployee?: boolean;
    }) => {
      const updatePayload: Record<string, any> = {
        full_name: fullName || null,
        reporting_manager_id: reportingManagerId || null,
        department_id: departmentId || null,
        designation,
        pms_grade: pmsGrade,
        employee_category: employeeCategory ?? null,
        employment_status: employmentStatus ?? null,
        employee_code: employeeCode || null,
        mobile_number: mobileNumber !== undefined ? (mobileNumber || null) : undefined,
        group_doj: groupDoj !== undefined ? (groupDoj || null) : undefined,
        doj: doj !== undefined ? (doj || null) : undefined,
        confirmation_date: confirmationDate !== undefined ? (confirmationDate || null) : undefined,
        location_id: locationId !== undefined ? (locationId || null) : undefined,
      };
      if (isDummyEmployee !== undefined) {
        updatePayload.is_dummy_employee = !!isDummyEmployee;
      }

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
      invalidateProfileCaches(queryClient);
      queryClient.invalidateQueries({ queryKey: ['dummy-employee-ids'] });
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
      employee_category?: string;
      employment_status?: string;
      reporting_manager_id?: string;
      company_id?: string;
      portal_access?: boolean;
      group_doj?: string;
      doj?: string;
      confirmation_date?: string;
      location_id?: string;
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
          employee_category: data.employee_category || undefined,
          employment_status: data.employment_status || undefined,
          reporting_manager_id: data.reporting_manager_id || undefined,
          company_id: data.company_id || undefined,
          portal_access: data.portal_access,
          group_doj: data.group_doj || undefined,
          doj: data.doj || undefined,
          confirmation_date: data.confirmation_date || undefined,
          location_id: data.location_id || undefined,
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

      // v2.67.x — Persist Dummy/System Employee flag post-create. The
      // `create-employee` edge function does not accept this field yet, so
      // we write it directly to `profiles` after the row exists.
      if (newIsDummy && response.data?.profile?.id) {
        const { error: dummyErr } = await supabase
          .from('profiles')
          .update({ is_dummy_employee: true } as any)
          .eq('id', response.data.profile.id);
        if (dummyErr) throw dummyErr;
      }

      // Persist admin-defined custom field values (if any active fields exist).
      if (response.data?.profile?.id && customFieldDefs.length > 0) {
        const normalized = normalizeCustomFieldValues(customFieldDefs, customValues);
        if (Object.keys(normalized).length > 0) {
          try {
            await saveEmployeeMasterCustomFieldValues(response.data.profile.id, normalized);
          } catch (e: any) {
            // Non-fatal: user is created. Surface a toast only.
            toast({
              title: 'User created, but custom fields failed to save',
              description: e?.message,
              variant: 'destructive',
            });
          }
        }
      }

      return response.data;
    },
    onSuccess: (data) => {
      invalidateProfileCaches(queryClient);
      queryClient.invalidateQueries({ queryKey: ['dummy-employee-ids'] });
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
      invalidateProfileCaches(queryClient);
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
      return invokeAdminEdgeFunction<{ success: boolean; message: string; resetLink?: string | null }>(
        'reset-password',
        { email, action: 'generate_link' },
      );
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
      return invokeAdminEdgeFunction<{ success: boolean; message: string }>(
        'reset-password',
        { email, newPassword: password, action: 'set_password' },
      );
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
      invalidateProfileCaches(queryClient);
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
    // Fields below are NOT in the slim roster — clear, then hydrate from DB.
    setEditEmployeeCategory('');
    setEditEmploymentStatus('');
    setEditEmployeeCode(user.employee_code || '');
    setEditFullName(user.full_name || '');
    setEditEmail(user.email || '');
    setEditMobile('');
    setEditIsActive((user as any).is_active !== false);
    setEditIsDummy(dummyIds.has(user.id));
    setEditGroupDoj('');
    setEditDoj('');
    setEditConfirmationDate('');
    setEditLocationId('');
    setEditDialogOpen(true);
    // Supplemental fetch — the roster RPC is intentionally slim for perf,
    // so we pull the editable columns directly from `profiles` on demand.
    setEditHydrating(true);
    supabase
      .from('profiles')
      .select('group_doj, doj, confirmation_date, location_id, employee_category, employment_status, mobile_number')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          toast({
            title: 'Failed to load user details',
            description: error.message,
            variant: 'destructive',
          });
          setEditDialogOpen(false);
          setEditHydrating(false);
          return;
        }
        const row = (data as any) || {};
        setEditGroupDoj(row.group_doj || '');
        setEditDoj(row.doj || '');
        setEditConfirmationDate(row.confirmation_date || '');
        setEditLocationId(row.location_id || '');
        setEditEmployeeCategory(row.employee_category || '');
        setEditEmploymentStatus(row.employment_status || '');
        setEditMobile(row.mobile_number || '');
        setEditHydrating(false);
      });
  };

  const handleSaveUser = async () => {
    if (!selectedUser) return;

    // If email changed, update via edge function first
    const emailChanged = (editEmail.trim().toLowerCase()) !== (selectedUser.email?.trim().toLowerCase() || '');
    if (emailChanged) {
      try {
        const result = await invokeAdminEdgeFunction<{ success: boolean; message?: string; warning?: string; auth_action?: 'created' | 'updated' }>(
          'update-user-email',
          { userId: selectedUser.id, newEmail: editEmail.trim() },
        );
        if (result?.warning) {
          toast({ title: 'Email updated with warning', description: result.warning, variant: 'destructive' });
        } else if (result?.auth_action === 'created') {
          toast({ title: 'Login provisioned', description: 'User can now sign in once a password is set via Password Rollout.' });
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
      employeeCategory: editEmployeeCategory,
      employmentStatus: editEmploymentStatus,
      employeeCode: editEmployeeCode,
      mobileNumber: editMobile,
      isActive: editIsActive,
      groupDoj: editGroupDoj || null,
      doj: editDoj || null,
      confirmationDate: editConfirmationDate || null,
      locationId: editLocationId || null,
      isDummyEmployee: editIsDummy,
    });
  };

  const handleCreateUser = () => {
    // Validate against admin-configured Employee Master Field Requirements.
    const fieldValues = {
      full_name: newFullName,
      email: newPortalAccess ? newEmail : (emfReqs.email ? newEmail : 'n/a'),
      employee_code: newEmployeeCode,
      group_doj: newGroupDoj,
      doj: newDoj,
      confirmation_date: newConfirmationDate,
      company_id: newCompanyId,
      division_id: newDivisionId,
      department_id: newDepartmentId,
      designation: newDesignation,
      pms_grade: newPmsGrade,
      employee_category: newEmployeeCategory,
      employment_status: newEmploymentStatus,
      location_id: newLocationId,
      reporting_manager_id: newManagerId,
      role: newRole,
      portal_access: newPortalAccess,
      is_dummy_employee: newIsDummy,
    };
    const v = validateRequiredFields(fieldValues, emfReqs);
    if (v.ok === false) {
      toast({ title: v.message, variant: 'destructive' });
      return;
    }
    const cv = validateCustomFieldValues(customFieldDefs, customValues);
    if (cv.ok === false) {
      toast({ title: cv.message, variant: 'destructive' });
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
      employee_category: newEmployeeCategory || undefined,
      employment_status: newEmploymentStatus || undefined,
      reporting_manager_id: newManagerId || undefined,
      company_id: newCompanyId || undefined,
      portal_access: newPortalAccess,
      group_doj: newGroupDoj || undefined,
      doj: newDoj || undefined,
      confirmation_date: newConfirmationDate || undefined,
      location_id: newLocationId || undefined,
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
    setNewEmployeeCategory('');
    setNewEmploymentStatus('');
    setNewManagerId('');
    setNewDivisionId('');
    setNewCompanyId('');
    setNewPortalAccess(true);
    setNewGroupDoj('');
    setNewDoj('');
    setNewConfirmationDate('');
    setNewLocationId('');
    setNewIsDummy(false);
    setCustomValues({});
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
    setResetUserEmail(user.email || '');
    setResetUserName(user.full_name || user.email || 'Unknown');
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
  // v2.66.12 — `useProfiles()` is sourced from `get_reviewer_roster_slim`
  // which returns ACTIVE employees only. Deriving inactive from that array
  // always yields 0. Pull authoritative totals via lightweight head-count
  // queries on `profiles` instead.
  const { data: userStats } = useQuery({
    queryKey: ['user-mgmt-stats'],
    staleTime: 60_000,
    queryFn: async () => {
      const [totalRes, inactiveRes] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_active', false),
      ]);
      if (totalRes.error) throw totalRes.error;
      if (inactiveRes.error) throw inactiveRes.error;
      return {
        total: totalRes.count ?? 0,
        inactive: inactiveRes.count ?? 0,
      };
    },
  });
  const rosterLen = profiles?.length || 0;
  const totalUsers = userStats?.total ?? rosterLen;
  const inactiveUsers = userStats?.inactive ?? 0;
  const activeUsers = Math.max(0, totalUsers - inactiveUsers);
  const admins = profiles?.filter(p => (p.user_roles as any)?.[0]?.role === 'admin').length || 0;

  if (isLoading) {
    return <UserManagementSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-md border bg-primary/5 px-4 py-3 flex items-start gap-3">
        <Sparkles className="h-4 w-4 text-primary mt-0.5" />
        <div className="flex-1 min-w-0 text-sm">
          <p className="font-medium">New: Identity & Access Console</p>
          <p className="text-muted-foreground">
            Manage users, roles, and capabilities across all modules in one place.
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/admin/iac">Open Console</Link>
        </Button>
      </div>
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
        <Select
          value={employeeTypeFilter}
          onValueChange={(v) => { setEmployeeTypeFilter(v as 'all' | 'real' | 'dummy'); handleFilterChange(); }}
        >
          <SelectTrigger className="w-[170px]" title="Employee Type">
            <SelectValue placeholder="Employee Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Employees</SelectItem>
            <SelectItem value="real">Real Employees</SelectItem>
            <SelectItem value="dummy">Dummy / System</SelectItem>
          </SelectContent>
        </Select>

        {selectedUserIds.size > 0 && (
          <Button variant="secondary" onClick={() => setBulkDialogOpen(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Bulk Update ({selectedUserIds.size})
          </Button>
        )}
        <Button
          variant={selectedUserIds.size > 0 ? 'default' : 'outline'}
          onClick={() => setBulkGrantOpen(true)}
        >
          <Shield className="h-4 w-4 mr-2" />
          Bulk Grant Access
          {selectedUserIds.size > 0 ? ` (${selectedUserIds.size})` : ''}
        </Button>
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
                const isInactive = (profile as any).is_active === false;
                return (
                  <div key={profile.id} className={`border rounded-lg p-3 space-y-2 ${isInactive ? 'opacity-60 bg-muted/30' : ''}`}>
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
                      <Button size="sm" variant="ghost" onClick={() => openEditDialog(profile)} className="min-h-[44px]" title="Edit">
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => openAccessSheet(profile, 'roles')} className="min-h-[44px]" title="Manage Access">
                        <Shield className="h-4 w-4 text-primary" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => {
                        const r = (profile.user_roles as any)?.[0]?.role || 'employee';
                        setAssignTargetUser({ id: profile.id, name: profile.full_name || profile.email, departmentId: profile.department_id, role: r });
                        setSmartAssignDialogOpen(true);
                      }} className="min-h-[44px]" title="Assign KRAs">
                        <Package className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => openAccessSheet(profile, 'password')} className="min-h-[44px]" title="Password Rollout">
                        <KeyRound className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => {
                        setWorkingDaysEmployee({ id: profile.id, full_name: profile.full_name, email: profile.email, employee_code: profile.employee_code });
                        setWorkingDaysDialogOpen(true);
                      }} className="min-h-[44px]">
                        <Calendar className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => confirmDelete(profile.id, profile.full_name || profile.email || 'Unknown')} className="min-h-[44px]">
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
                  const isInactive = (profile as any).is_active === false;
                  return (
                    <TableRow key={profile.id} className={isInactive ? 'opacity-60 bg-muted/30' : ''}>
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
                            <p className="text-xs text-muted-foreground">{profile.email || '—'}</p>
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
                        {dummyIds.has(profile.id) && (
                          <Badge variant="secondary" className="text-xs ml-1" title="Dummy/System employee">Dummy/System</Badge>
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
                            onClick={() => openAccessSheet(profile, 'roles')}
                            title="Manage Access (Roles · Password · Audit)"
                          >
                            <Shield className="h-4 w-4 text-primary" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            onClick={() => {
                              const role = (profile.user_roles as any)?.[0]?.role || 'employee';
                              setAssignTargetUser({
                                id: profile.id,
                                name: profile.full_name || profile.email || 'Unknown',
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
                            onClick={() => openAccessSheet(profile, 'password')}
                            title="Password Rollout"
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
                                email: profile.email || '',
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
                            onClick={() => confirmDelete(profile.id, profile.full_name || profile.email || 'Unknown')}
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
        <DialogContent className="max-w-5xl w-[96vw] max-h-[92vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update details for {selectedUser?.full_name}</DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="profile" className="flex-1 flex flex-col min-h-0">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="profile" className="gap-1.5"><Users className="h-3.5 w-3.5" /> Profile</TabsTrigger>
              <TabsTrigger value="access" className="gap-1.5"><Shield className="h-3.5 w-3.5" /> Access & Login</TabsTrigger>
            </TabsList>

            <ScrollArea className="flex-1 pr-4 -mr-4 mt-3">
            <TabsContent value="profile" className="mt-0 space-y-4">
              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Personal Information</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>Full Name</Label>
                    <Input
                      value={editFullName}
                      onChange={(e) => setEditFullName(e.target.value)}
                      placeholder="e.g. John Doe"
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Email</Label>
                    <Input
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      placeholder="e.g. user@example.com"
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Employee Code</Label>
                    <Input
                      value={editEmployeeCode}
                      onChange={(e) => setEditEmployeeCode(e.target.value)}
                      placeholder="e.g. EMP001"
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Mobile Number</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="tel"
                        value={editMobile}
                        onChange={(e) => setEditMobile(e.target.value)}
                        placeholder="+91 98765 43210"
                        className="pl-9 h-9"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Group Date of Joining (GDOJ)</Label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <Input
                        type="date"
                        value={editGroupDoj}
                        onChange={(e) => setEditGroupDoj(e.target.value)}
                        className="pl-9 h-9"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Date of Joining (DOJ)</Label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <Input
                        type="date"
                        value={editDoj}
                        onChange={(e) => setEditDoj(e.target.value)}
                        className="pl-9 h-9"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Confirmation Date</Label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <Input
                        type="date"
                        value={editConfirmationDate}
                        onChange={(e) => setEditConfirmationDate(e.target.value)}
                        className="pl-9 h-9"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Section: Organization */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Organization</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>Division</Label>
                    <OrgFilterCombobox
                      value={editDivisionId}
                      onValueChange={(val) => {
                        setEditDivisionId(val);
                        if (val && editDepartmentId && editDepartmentId !== 'none') {
                          const buIdsInDiv = new Set(businessUnits?.filter(bu => bu.division_id === val).map(bu => bu.id));
                          const dept = departments?.find(d => d.id === editDepartmentId);
                          if (dept && dept.business_unit_id && !buIdsInDiv.has(dept.business_unit_id)) {
                            setEditDepartmentId('none');
                          }
                        }
                      }}
                      options={divisionOptions}
                      placeholder="All divisions"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Department</Label>
                    <OrgFilterCombobox
                      value={editDepartmentId === 'none' ? '' : editDepartmentId}
                      onValueChange={(val) => setEditDepartmentId(val || 'none')}
                      options={editDepartmentOptions}
                      placeholder="Select department"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Designation</Label>
                    <OrgFilterCombobox
                      value={editDesignation}
                      onValueChange={setEditDesignation}
                      options={designationOptions}
                      placeholder="Select designation"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>PMS Grade</Label>
                    <OrgFilterCombobox
                      value={editPmsGrade}
                      onValueChange={setEditPmsGrade}
                      options={pmsGradeOptions}
                      placeholder="Select PMS grade"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Employee Category</Label>
                    <OrgFilterCombobox
                      value={editEmployeeCategory}
                      onValueChange={setEditEmployeeCategory}
                      options={employeeCategoryOptions}
                      placeholder="Select employee category"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Employment Status</Label>
                    <OrgFilterCombobox
                      value={editEmploymentStatus}
                      onValueChange={setEditEmploymentStatus}
                      options={employmentStatusOptions}
                      placeholder="Select employment status"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Location</Label>
                    <OrgFilterCombobox
                      value={editLocationId}
                      onValueChange={setEditLocationId}
                      options={locationOptions}
                      placeholder="Select location"
                    />
                  </div>
                  <div className="space-y-1.5">
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
            </TabsContent>

            <TabsContent value="access" className="mt-0 space-y-4">
              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Access & Status</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Role</Label>
                    <OrgFilterCombobox
                      value={editRole}
                      onValueChange={(v) => v && setEditRole(v as AppRole)}
                      options={roleOptions}
                      placeholder="Select role"
                    />
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
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <Label>Is this a dummy/system employee?</Label>
                    <p className="text-xs text-muted-foreground">
                      Dummy/system employees are used for system access, audit, testing, or non-real employee records.
                      They can be hidden from reports and frontend employee views based on General Settings.
                    </p>
                  </div>
                  <Switch checked={editIsDummy} onCheckedChange={setEditIsDummy} />
                </div>
              </div>

              {/* Section: Module Access & Login (shortcuts to UserAccessSheet) */}
              {selectedUser && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Module Access & Login</h3>
                  </div>
                  <Separator />
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    <button
                      type="button"
                      onClick={() => { const u = selectedUser; setEditDialogOpen(false); openAccessSheet(u, 'roles'); }}
                      className="text-left rounded-lg border p-4 hover:border-primary hover:bg-accent/50 transition-colors"
                    >
                      <Shield className="h-5 w-5 text-primary mb-2" />
                      <p className="text-sm font-semibold">Grant module roles</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Assign PMS, Safety, HR roles. Multiple allowed.</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => { const u = selectedUser; setEditDialogOpen(false); openAccessSheet(u, 'password'); }}
                      className="text-left rounded-lg border p-4 hover:border-primary hover:bg-accent/50 transition-colors"
                    >
                      <KeyRound className="h-5 w-5 text-primary mb-2" />
                      <p className="text-sm font-semibold">Send / reset password</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Email credentials or generate manually.</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => { const u = selectedUser; setEditDialogOpen(false); openAccessSheet(u, 'audit'); }}
                      className="text-left rounded-lg border p-4 hover:border-primary hover:bg-accent/50 transition-colors"
                    >
                      <Search className="h-5 w-5 text-primary mb-2" />
                      <p className="text-sm font-semibold">View access history</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Recent grants, revokes, and email changes.</p>
                    </button>
                    <InlineWorkflowMappingCard employeeId={selectedUser.id} />
                  </div>
                </div>
              )}
            </TabsContent>
            </ScrollArea>
          </Tabs>

          <DialogFooter className="pt-4 border-t">
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveUser} disabled={updateUser.isPending || editHydrating}>
              {editHydrating ? 'Loading…' : updateUser.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-5xl w-[96vw] max-h-[92vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
            <DialogDescription>Create a new user account and assign their role</DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="profile" className="flex-1 flex flex-col min-h-0">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="profile" className="gap-1.5"><Users className="h-3.5 w-3.5" /> Profile</TabsTrigger>
              <TabsTrigger value="access" className="gap-1.5"><Shield className="h-3.5 w-3.5" /> Access</TabsTrigger>
            </TabsList>

            <ScrollArea className="flex-1 pr-4 -mr-4 mt-3">
            <TabsContent value="profile" className="mt-0 space-y-4">
              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Personal Information</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                   <div className="space-y-1.5">
                    <Label>Full Name<ReqMark k="full_name" /></Label>
                    <Input
                      value={newFullName}
                      onChange={(e) => setNewFullName(e.target.value)}
                      placeholder="John Doe"
                      className="h-9"
                    />
                  </div>
                  {newPortalAccess && (
                    <div className="space-y-1.5">
                      <Label>Email<ReqMark k="email" /></Label>
                      <Input
                        type="email"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="john@example.com"
                        className="h-9"
                      />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label>Employee Code<ReqMark k="employee_code" /></Label>
                    <Input
                      value={newEmployeeCode}
                      onChange={(e) => setNewEmployeeCode(e.target.value)}
                      placeholder="EMP001"
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Group Date of Joining (GDOJ)<ReqMark k="group_doj" /></Label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <Input
                        type="date"
                        value={newGroupDoj}
                        onChange={(e) => setNewGroupDoj(e.target.value)}
                        className="pl-9 h-9"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Date of Joining (DOJ)<ReqMark k="doj" /></Label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <Input
                        type="date"
                        value={newDoj}
                        onChange={(e) => setNewDoj(e.target.value)}
                        className="pl-9 h-9"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Confirmation Date<ReqMark k="confirmation_date" /></Label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <Input
                        type="date"
                        value={newConfirmationDate}
                        onChange={(e) => setNewConfirmationDate(e.target.value)}
                        className="pl-9 h-9"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Section: Organization */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Organization</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>Company<ReqMark k="company_id" /></Label>
                    <OrgFilterCombobox
                      value={newCompanyId}
                      onValueChange={setNewCompanyId}
                      options={companyOptions}
                      placeholder="Select company"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Division<ReqMark k="division_id" /></Label>
                    <OrgFilterCombobox
                      value={newDivisionId}
                      onValueChange={(val) => {
                        setNewDivisionId(val);
                        if (val && newDepartmentId) {
                          const buIdsInDiv = new Set(businessUnits?.filter(bu => bu.division_id === val).map(bu => bu.id));
                          const dept = departments?.find(d => d.id === newDepartmentId);
                          if (dept && dept.business_unit_id && !buIdsInDiv.has(dept.business_unit_id)) {
                            setNewDepartmentId('');
                          }
                        }
                      }}
                      options={divisionOptions}
                      placeholder="All divisions"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Department<ReqMark k="department_id" /></Label>
                    <OrgFilterCombobox
                      value={newDepartmentId}
                      onValueChange={setNewDepartmentId}
                      options={createDepartmentOptions}
                      placeholder="Select department"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Designation<ReqMark k="designation" /></Label>
                    <OrgFilterCombobox
                      value={newDesignation}
                      onValueChange={setNewDesignation}
                      options={designationOptions}
                      placeholder="Select designation"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>PMS Grade<ReqMark k="pms_grade" /></Label>
                    <OrgFilterCombobox
                      value={newPmsGrade}
                      onValueChange={setNewPmsGrade}
                      options={pmsGradeOptions}
                      placeholder="Select PMS grade"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Employee Category<ReqMark k="employee_category" /></Label>
                    <OrgFilterCombobox
                      value={newEmployeeCategory}
                      onValueChange={setNewEmployeeCategory}
                      options={employeeCategoryOptions}
                      placeholder="Select employee category"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Employment Status<ReqMark k="employment_status" /></Label>
                    <OrgFilterCombobox
                      value={newEmploymentStatus}
                      onValueChange={setNewEmploymentStatus}
                      options={employmentStatusOptions}
                      placeholder="Select employment status"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Location<ReqMark k="location_id" /></Label>
                    <OrgFilterCombobox
                      value={newLocationId}
                      onValueChange={setNewLocationId}
                      options={locationOptions}
                      placeholder="Select location"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Reporting Manager<ReqMark k="reporting_manager_id" /></Label>
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

              {customFieldDefs.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Additional Information</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {customFieldDefs.map((def) => (
                      <CustomFieldRenderer
                        key={def.id}
                        def={def}
                        value={customValues[def.field_key]}
                        onChange={(v) =>
                          setCustomValues((prev) => ({ ...prev, [def.field_key]: v }))
                        }
                      />
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="access" className="mt-0 space-y-4">
              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Access</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Role<ReqMark k="role" /></Label>
                    <OrgFilterCombobox
                      value={newRole}
                      onValueChange={(v) => v && setNewRole(v as AppRole)}
                      options={roleOptions}
                      placeholder="Select role"
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-3 h-fit">
                    <div className="space-y-0.5">
                      <Label>Portal Access<ReqMark k="portal_access" /></Label>
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
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <Label>Is this a dummy/system employee?<ReqMark k="is_dummy_employee" /></Label>
                    <p className="text-xs text-muted-foreground">
                      Dummy/system employees are used for system access, audit, testing, or non-real employee records.
                      They can be hidden from reports and frontend employee views based on General Settings.
                    </p>
                  </div>
                  <Switch checked={newIsDummy} onCheckedChange={setNewIsDummy} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Tip: after creating the user, open <span className="font-medium">Manage Access</span> from the user row to grant additional module roles (PMS, Safety, HR) and send the welcome password.
                </p>
              </div>
            </TabsContent>
            </ScrollArea>
          </Tabs>

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

      {/* Per-user Access cockpit: Roles · Password · Audit */}
      <UserAccessSheet
        user={accessUser}
        defaultTab={accessTab}
        onClose={() => {
          setAccessUser(null);
          if (searchParams.get('manage')) {
            const next = new URLSearchParams(searchParams);
            next.delete('manage');
            next.delete('tab');
            setSearchParams(next, { replace: true });
          }
        }}
      />

      {/* Bulk Grant Access dialog — multi-user × multi-role IAC grants */}
      <BulkGrantAccessDialog
        open={bulkGrantOpen}
        onOpenChange={setBulkGrantOpen}
        initialUsers={(profiles ?? [])
          .filter((p) => selectedUserIds.has(p.id))
          .map<BulkGrantTarget>((p) => ({
            id: p.id,
            full_name: p.full_name,
            email: p.email,
            employee_code: p.employee_code,
            is_active: (p as any).is_active !== false,
          }))}
        pool={(profiles ?? []).map<BulkGrantTarget>((p) => ({
          id: p.id,
          full_name: p.full_name,
          email: p.email,
          employee_code: p.employee_code,
          is_active: (p as any).is_active !== false,
        }))}
        onCompleted={() => setSelectedUserIds(new Set())}
      />
    </div>
  );
}
