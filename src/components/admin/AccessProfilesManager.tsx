import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Shield, Plus, Trash2, Save, Users, Settings2, Search } from 'lucide-react';
import { useAccessProfiles, type AccessProfileMenuRight } from '@/hooks/useAccessProfiles';
import { useMenuAccess, type MenuAccessConfig } from '@/hooks/useMenuAccess';
import { useCompanies } from '@/hooks/useCompanies';
import { useDivisions, useBusinessUnits, useDepartments, useSubBranches } from '@/hooks/useOrganization';
import { useEmployeeFilterOptions } from '@/hooks/useEmployeeFilterOptions';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { OrgFilterCombobox, type ComboboxOption } from './OrgFilterCombobox';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';

const SECTION_LABELS: Record<string, string> = {
  main: 'Main', manager: 'Manager', hr_pms: 'HR PMS', management: 'Management',
  audit: 'Audit', admin: 'Administration', dataEntry: 'Data Entry', reports: 'Reports',
};
const SECTION_ORDER = ['main', 'manager', 'hr_pms', 'management', 'audit', 'admin', 'dataEntry', 'reports'];

export function AccessProfilesManager() {
  const {
    profiles, orgScopes, menuRights, assignments, isLoading,
    createProfile, updateProfile, deleteProfile,
    saveOrgScope, deleteOrgScope, saveMenuRights,
    assignUser, removeAssignment,
  } = useAccessProfiles();
  const { configs } = useMenuAccess();
  const { toast } = useToast();

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-96 w-full" /></div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" />Access Profiles</CardTitle>
        <CardDescription>Create named permission profiles, map org scope & menu rights, and assign users.</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="profiles">
          <TabsList className="mb-4">
            <TabsTrigger value="profiles"><Settings2 className="h-4 w-4 mr-1" />Profiles</TabsTrigger>
            <TabsTrigger value="mapping"><Shield className="h-4 w-4 mr-1" />Profile Mapping</TabsTrigger>
            <TabsTrigger value="assignment"><Users className="h-4 w-4 mr-1" />Assignment</TabsTrigger>
          </TabsList>

          <TabsContent value="profiles">
            <ProfilesTab
              profiles={profiles}
              assignments={assignments}
              createProfile={createProfile}
              updateProfile={updateProfile}
              deleteProfile={deleteProfile}
              toast={toast}
            />
          </TabsContent>

          <TabsContent value="mapping">
            <MappingTab
              profiles={profiles}
              orgScopes={orgScopes}
              menuRights={menuRights}
              configs={configs}
              saveOrgScope={saveOrgScope}
              deleteOrgScope={deleteOrgScope}
              saveMenuRights={saveMenuRights}
              toast={toast}
            />
          </TabsContent>

          <TabsContent value="assignment">
            <AssignmentTab
              profiles={profiles}
              assignments={assignments}
              assignUser={assignUser}
              removeAssignment={removeAssignment}
              toast={toast}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

/* ─── Tab 1: Profiles ─── */
function ProfilesTab({ profiles, assignments, createProfile, updateProfile, deleteProfile, toast }: any) {
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await createProfile.mutateAsync({ name: newName.trim(), description: newDesc.trim() || undefined });
      toast({ title: 'Profile Created' });
      setNewName('');
      setNewDesc('');
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteProfile.mutateAsync(deleteTarget);
      toast({ title: 'Profile Deleted' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-end">
        <div className="flex-1 space-y-1.5">
          <label className="text-sm font-medium">Profile Name</label>
          <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Plant HR" />
        </div>
        <div className="flex-1 space-y-1.5">
          <label className="text-sm font-medium">Description</label>
          <Input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Optional description" />
        </div>
        <Button onClick={handleCreate} disabled={!newName.trim() || createProfile.isPending}>
          <Plus className="h-4 w-4 mr-1" />Create
        </Button>
      </div>

      {profiles.length > 0 ? (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-center w-[80px]">Active</TableHead>
                <TableHead className="text-center w-[80px]">Users</TableHead>
                <TableHead className="text-center w-[80px]">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.map((p: any) => {
                const userCount = assignments.filter((a: any) => a.profile_id === p.id).length;
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.description || '—'}</TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={p.is_active}
                        onCheckedChange={(checked) => updateProfile.mutateAsync({ id: p.id, is_active: checked })}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">{userCount}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => setDeleteTarget(p.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-4">No access profiles created yet.</p>
      )}

      <ConfirmDestructiveDialog
        open={!!deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Access Profile"
        description="This will permanently delete the profile, all its org scopes, menu rights, and user assignments. This action cannot be undone."
      />
    </div>
  );
}

/* ─── Tab 2: Profile Mapping ─── */
function MappingTab({ profiles, orgScopes, menuRights, configs, saveOrgScope, deleteOrgScope, saveMenuRights, toast }: any) {
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const { data: companies = [] } = useCompanies();
  const { data: divisions = [] } = useDivisions();
  const { data: businessUnits = [] } = useBusinessUnits();
  const { data: departments = [] } = useDepartments();
  const { designations, grades } = useEmployeeFilterOptions();

  // Levels from profiles
  const { data: levels = [] } = useQuery({
    queryKey: ['distinct-levels'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('level').eq('is_active', true).not('level', 'is', null);
      return [...new Set(data?.map(p => p.level))].filter(Boolean).sort() as string[];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Org scope form state
  const [scopeForm, setScopeForm] = useState({
    company_id: '', division_id: '', business_unit_id: '',
    department_id: '', designation: '', pms_grade: '', level: '',
  });

  // Menu rights editing
  const profileMenuRights = useMemo(() => {
    if (!selectedProfileId) return new Map<string, AccessProfileMenuRight>();
    const map = new Map<string, AccessProfileMenuRight>();
    menuRights.filter((r: any) => r.profile_id === selectedProfileId).forEach((r: any) => map.set(r.menu_key, r));
    return map;
  }, [menuRights, selectedProfileId]);

  const [editedRights, setEditedRights] = useState<Record<string, { can_view: boolean; can_add: boolean; can_update: boolean; can_delete: boolean }>>({});

  // Reset edited rights when profile changes
  const handleProfileChange = (id: string) => {
    setSelectedProfileId(id);
    setEditedRights({});
    setScopeForm({ company_id: '', division_id: '', business_unit_id: '', department_id: '', designation: '', pms_grade: '', level: '' });
  };

  const getRights = (menuKey: string) => {
    if (editedRights[menuKey]) return editedRights[menuKey];
    const existing = profileMenuRights.get(menuKey);
    return existing ? { can_view: existing.can_view, can_add: existing.can_add, can_update: existing.can_update, can_delete: existing.can_delete } : { can_view: false, can_add: false, can_update: false, can_delete: false };
  };

  const toggleRight = (menuKey: string, field: 'can_view' | 'can_add' | 'can_update' | 'can_delete') => {
    const current = getRights(menuKey);
    setEditedRights(prev => ({ ...prev, [menuKey]: { ...current, [field]: !current[field] } }));
  };

  const profileScopes = useMemo(() => orgScopes.filter((s: any) => s.profile_id === selectedProfileId), [orgScopes, selectedProfileId]);

  const companyOptions: ComboboxOption[] = companies.map((c: any) => ({ value: c.id, label: c.name }));
  const divisionOptions: ComboboxOption[] = divisions
    .filter((d: any) => !scopeForm.company_id || d.company_id === scopeForm.company_id)
    .map((d: any) => ({ value: d.id, label: d.name }));
  const buOptions: ComboboxOption[] = businessUnits
    .filter((b: any) => !scopeForm.division_id || b.division_id === scopeForm.division_id)
    .map((b: any) => ({ value: b.id, label: b.name }));
  const deptOptions: ComboboxOption[] = departments
    .filter((d: any) => !scopeForm.business_unit_id || d.business_unit_id === scopeForm.business_unit_id)
    .map((d: any) => ({ value: d.id, label: d.name }));
  const designationOptions: ComboboxOption[] = designations.map((d: string) => ({ value: d, label: d }));
  const gradeOptions: ComboboxOption[] = grades.map((g: string) => ({ value: g, label: g }));
  const levelOptions: ComboboxOption[] = levels.map((l: string) => ({ value: l, label: l }));

  const hasScopeFilter = Object.values(scopeForm).some(v => !!v);

  const handleAddScope = async () => {
    if (!selectedProfileId || !hasScopeFilter) return;
    try {
      await saveOrgScope.mutateAsync({
        profileId: selectedProfileId,
        scope: {
          company_id: scopeForm.company_id || null,
          division_id: scopeForm.division_id || null,
          business_unit_id: scopeForm.business_unit_id || null,
          department_id: scopeForm.department_id || null,
          designation: scopeForm.designation || null,
          pms_grade: scopeForm.pms_grade || null,
          level: scopeForm.level || null,
        },
      });
      toast({ title: 'Org Scope Added' });
      setScopeForm({ company_id: '', division_id: '', business_unit_id: '', department_id: '', designation: '', pms_grade: '', level: '' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const handleSaveRights = async () => {
    if (!selectedProfileId) return;
    const allRights = (configs as MenuAccessConfig[]).map(c => {
      const r = editedRights[c.menu_key] || (() => {
        const ex = profileMenuRights.get(c.menu_key);
        return ex ? { can_view: ex.can_view, can_add: ex.can_add, can_update: ex.can_update, can_delete: ex.can_delete } : { can_view: false, can_add: false, can_update: false, can_delete: false };
      })();
      return { menu_key: c.menu_key, ...r };
    });
    try {
      await saveMenuRights.mutateAsync({ profileId: selectedProfileId, rights: allRights });
      toast({ title: 'Menu Rights Saved' });
      setEditedRights({});
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  // Group configs by section
  const sections = (configs as MenuAccessConfig[]).reduce<Record<string, MenuAccessConfig[]>>((acc, c) => {
    (acc[c.section] ||= []).push(c);
    return acc;
  }, {});

  // Resolve scope labels
  const getScopeLabel = (scope: any) => {
    const parts: string[] = [];
    if (scope.company_id) parts.push(companies.find((c: any) => c.id === scope.company_id)?.name || scope.company_id);
    if (scope.division_id) parts.push(divisions.find((d: any) => d.id === scope.division_id)?.name || scope.division_id);
    if (scope.business_unit_id) parts.push(businessUnits.find((b: any) => b.id === scope.business_unit_id)?.name || scope.business_unit_id);
    if (scope.department_id) parts.push(departments.find((d: any) => d.id === scope.department_id)?.name || scope.department_id);
    if (scope.designation) parts.push(scope.designation);
    if (scope.pms_grade) parts.push(`Grade: ${scope.pms_grade}`);
    if (scope.level) parts.push(`Level: ${scope.level}`);
    return parts.join(' → ') || '—';
  };

  const profileOptions: ComboboxOption[] = profiles.map((p: any) => ({ value: p.id, label: p.name }));

  return (
    <div className="space-y-6">
      <OrgFilterCombobox
        value={selectedProfileId}
        onValueChange={handleProfileChange}
        options={profileOptions}
        placeholder="Select a profile..."
        label="Profile"
      />

      {selectedProfileId && (
        <>
          {/* Org Scope */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Org-Level Scope</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <OrgFilterCombobox value={scopeForm.company_id} onValueChange={v => setScopeForm(p => ({ ...p, company_id: v, division_id: '', business_unit_id: '', department_id: '' }))} options={companyOptions} placeholder="Company..." label="Company" />
              <OrgFilterCombobox value={scopeForm.division_id} onValueChange={v => setScopeForm(p => ({ ...p, division_id: v, business_unit_id: '', department_id: '' }))} options={divisionOptions} placeholder="Division..." label="Division" />
              <OrgFilterCombobox value={scopeForm.business_unit_id} onValueChange={v => setScopeForm(p => ({ ...p, business_unit_id: v, department_id: '' }))} options={buOptions} placeholder="Business Unit..." label="Business Unit" />
              <OrgFilterCombobox value={scopeForm.department_id} onValueChange={v => setScopeForm(p => ({ ...p, department_id: v }))} options={deptOptions} placeholder="Department..." label="Department" />
              <OrgFilterCombobox value={scopeForm.designation} onValueChange={v => setScopeForm(p => ({ ...p, designation: v }))} options={designationOptions} placeholder="Designation..." label="Designation" />
              <OrgFilterCombobox value={scopeForm.pms_grade} onValueChange={v => setScopeForm(p => ({ ...p, pms_grade: v }))} options={gradeOptions} placeholder="Grade..." label="Grade" />
              <OrgFilterCombobox value={scopeForm.level} onValueChange={v => setScopeForm(p => ({ ...p, level: v }))} options={levelOptions} placeholder="Level..." label="Level" />
              <div className="flex items-end">
                <Button onClick={handleAddScope} disabled={!hasScopeFilter || saveOrgScope.isPending} className="w-full">
                  <Plus className="h-4 w-4 mr-1" />Add Scope
                </Button>
              </div>
            </div>

            {profileScopes.length > 0 && (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Org Scope</TableHead>
                      <TableHead className="w-[60px] text-center">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {profileScopes.map((s: any) => (
                      <TableRow key={s.id}>
                        <TableCell className="text-sm">{getScopeLabel(s)}</TableCell>
                        <TableCell className="text-center">
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => deleteOrgScope.mutateAsync(s.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {/* Menu Rights Grid */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Menu Access Rights</h4>
              <Button onClick={handleSaveRights} disabled={Object.keys(editedRights).length === 0 || saveMenuRights.isPending} size="sm">
                <Save className="h-4 w-4 mr-1" />Save Rights
              </Button>
            </div>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px]">Section</TableHead>
                    <TableHead>Menu Item</TableHead>
                    <TableHead className="text-center w-[70px]">View</TableHead>
                    <TableHead className="text-center w-[70px]">Add</TableHead>
                    <TableHead className="text-center w-[70px]">Update</TableHead>
                    <TableHead className="text-center w-[70px]">Delete</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {SECTION_ORDER.map(sectionKey => {
                    const items = sections[sectionKey];
                    if (!items?.length) return null;
                    return items.map((config, idx) => {
                      const rights = getRights(config.menu_key);
                      return (
                        <TableRow key={config.menu_key}>
                          <TableCell className="text-xs text-muted-foreground">
                            {idx === 0 && (
                              <Badge variant="outline" className="text-[10px]">
                                {SECTION_LABELS[sectionKey] || sectionKey}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="font-medium text-sm">{config.menu_name}</TableCell>
                          {(['can_view', 'can_add', 'can_update', 'can_delete'] as const).map(field => (
                            <TableCell key={field} className="text-center">
                              <Checkbox
                                checked={rights[field]}
                                onCheckedChange={() => toggleRight(config.menu_key, field)}
                              />
                            </TableCell>
                          ))}
                        </TableRow>
                      );
                    });
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Tab 3: Assignment ─── */
function AssignmentTab({ profiles, assignments, assignUser, removeAssignment, toast }: any) {
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');

  const { data: allProfiles = [] } = useQuery({
    queryKey: ['profiles-for-access-assignment'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, employee_code, email')
        .eq('is_active', true)
        .order('full_name');
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const filteredUsers = useMemo(() => {
    if (!searchQuery) return allProfiles.slice(0, 20);
    const q = searchQuery.toLowerCase();
    return allProfiles.filter((p: any) =>
      p.full_name?.toLowerCase().includes(q) ||
      p.employee_code?.toLowerCase().includes(q) ||
      p.email?.toLowerCase().includes(q)
    ).slice(0, 20);
  }, [allProfiles, searchQuery]);

  const enrichedAssignments = useMemo(() => {
    return assignments.map((a: any) => {
      const profile = profiles.find((p: any) => p.id === a.profile_id);
      const user = allProfiles.find((p: any) => p.id === a.user_id);
      return {
        ...a,
        profileName: profile?.name || 'Unknown',
        userName: user?.full_name || user?.email || 'Unknown',
        employeeCode: user?.employee_code || '',
      };
    });
  }, [assignments, profiles, allProfiles]);

  const handleAssign = async () => {
    if (!selectedProfileId || !selectedUserId) return;
    try {
      await assignUser.mutateAsync({ profileId: selectedProfileId, userId: selectedUserId });
      toast({ title: 'User Assigned' });
      setSelectedUserId('');
      setSearchQuery('');
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const profileOptions: ComboboxOption[] = profiles.map((p: any) => ({ value: p.id, label: p.name }));

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-end">
        <div className="w-full sm:w-56">
          <OrgFilterCombobox
            value={selectedProfileId}
            onValueChange={setSelectedProfileId}
            options={profileOptions}
            placeholder="Select profile..."
            label="Profile"
          />
        </div>
        <div className="flex-1 space-y-1.5">
          <label className="text-sm font-medium">Employee</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or code..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          {searchQuery && (
            <div className="border rounded-md max-h-40 overflow-y-auto bg-background">
              {filteredUsers.map((p: any) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setSelectedUserId(p.id);
                    setSearchQuery(p.employee_code ? `${p.full_name || p.email} (${p.employee_code})` : (p.full_name || p.email || ''));
                  }}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors"
                >
                  {p.full_name || p.email}
                  {p.employee_code && <span className="text-muted-foreground ml-1">({p.employee_code})</span>}
                </button>
              ))}
              {filteredUsers.length === 0 && (
                <p className="text-xs text-muted-foreground px-3 py-2">No results</p>
              )}
            </div>
          )}
        </div>
        <Button onClick={handleAssign} disabled={!selectedProfileId || !selectedUserId || assignUser.isPending}>
          <Users className="h-4 w-4 mr-1" />Assign
        </Button>
      </div>

      {enrichedAssignments.length > 0 ? (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Profile</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Assigned</TableHead>
                <TableHead className="w-[80px] text-center">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {enrichedAssignments.map((a: any) => (
                <TableRow key={a.id}>
                  <TableCell><Badge variant="secondary">{a.profileName}</Badge></TableCell>
                  <TableCell className="font-medium">
                    {a.userName}
                    {a.employeeCode && <span className="text-muted-foreground ml-1 text-xs">({a.employeeCode})</span>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-center">
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => removeAssignment.mutateAsync(a.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-4">No users assigned to profiles yet.</p>
      )}
    </div>
  );
}
