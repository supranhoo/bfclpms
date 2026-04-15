import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, Menu, UserPlus, Trash2, Search, Settings2, Shield, Users } from 'lucide-react';
import { useMenuAccess, type MenuAccessConfig } from '@/hooks/useMenuAccess';
import { useAccessProfiles } from '@/hooks/useAccessProfiles';
import { ALL_APP_ROLES, type AppRole } from '@/lib/roles';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ProfilesTab, MappingTab, AssignmentTab } from './AccessProfilesManager';

const ROLE_LABELS: Record<AppRole, string> = {
  admin: 'Admin',
  manager: 'Manager',
  employee: 'Employee',
  auditor: 'Auditor',
  management: 'Management',
  hr_pms: 'HR PMS',
  skip_level: 'Skip-Level',
};

const SECTION_LABELS: Record<string, string> = {
  main: 'Main',
  manager: 'Manager',
  hr_pms: 'HR PMS',
  management: 'Management',
  audit: 'Audit',
  admin: 'Administration',
  dataEntry: 'Data Entry',
  reports: 'Reports',
};

export function MenuAccessTab() {
  const { configs, userOverrides, isLoading: menuLoading, updateMenuAccess, grantUserMenuAccess, revokeUserMenuAccess } = useMenuAccess();
  const {
    profiles, orgScopes, menuRights, assignments, isLoading: profilesLoading,
    createProfile, updateProfile, deleteProfile,
    saveOrgScope, deleteOrgScope, saveMenuRights,
    assignUser, removeAssignment,
  } = useAccessProfiles();
  const { toast } = useToast();
  const [editedConfigs, setEditedConfigs] = useState<Record<string, AppRole[]>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // Employee override form state
  const [overrideSearch, setOverrideSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedMenuKey, setSelectedMenuKey] = useState('');

  // Fetch profiles for employee selector
  const { data: employeeProfiles = [] } = useQuery({
    queryKey: ['profiles-for-menu-access'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, employee_code, email')
        .order('full_name');
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const filteredProfiles = useMemo(() => {
    if (!overrideSearch) return employeeProfiles.slice(0, 20);
    const q = overrideSearch.toLowerCase();
    return employeeProfiles.filter(p =>
      (p.full_name?.toLowerCase().includes(q)) ||
      (p.employee_code?.toLowerCase().includes(q)) ||
      (p.email?.toLowerCase().includes(q))
    ).slice(0, 20);
  }, [employeeProfiles, overrideSearch]);

  const enrichedOverrides = useMemo(() => {
    const configMap = new Map(configs.map(c => [c.menu_key, c.menu_name]));
    return userOverrides.map(o => {
      const profile = employeeProfiles.find(p => p.id === o.user_id);
      return {
        ...o,
        userName: profile?.full_name || profile?.email || 'Unknown',
        employeeCode: profile?.employee_code || '',
        menuName: configMap.get(o.menu_key) || o.menu_key,
      };
    });
  }, [userOverrides, employeeProfiles, configs]);

  const getEditedRoles = (config: MenuAccessConfig): AppRole[] => {
    return editedConfigs[config.menu_key] ?? config.allowed_roles;
  };

  const toggleRole = (menuKey: string, role: AppRole, currentRoles: AppRole[]) => {
    if (menuKey === 'admin-settings' && role === 'admin') return;
    const updated = currentRoles.includes(role)
      ? currentRoles.filter(r => r !== role)
      : [...currentRoles, role];
    setEditedConfigs(prev => ({ ...prev, [menuKey]: updated }));
  };

  const hasChanges = (config: MenuAccessConfig): boolean => {
    const edited = editedConfigs[config.menu_key];
    if (!edited) return false;
    const orig = config.allowed_roles;
    return JSON.stringify([...orig].sort()) !== JSON.stringify([...edited].sort());
  };

  const handleSave = async (config: MenuAccessConfig) => {
    const roles = getEditedRoles(config);
    setSavingKey(config.menu_key);
    try {
      await updateMenuAccess.mutateAsync({ menuKey: config.menu_key, allowedRoles: roles });
      setEditedConfigs(prev => {
        const next = { ...prev };
        delete next[config.menu_key];
        return next;
      });
      toast({ title: 'Saved', description: `Updated access for "${config.menu_name}"` });
    } catch {
      toast({ title: 'Error', description: 'Failed to save changes', variant: 'destructive' });
    } finally {
      setSavingKey(null);
    }
  };

  const handleGrantAccess = async () => {
    if (!selectedUserId || !selectedMenuKey) {
      toast({ title: 'Missing fields', description: 'Select both an employee and a menu item', variant: 'destructive' });
      return;
    }
    try {
      await grantUserMenuAccess.mutateAsync({ menuKey: selectedMenuKey, userId: selectedUserId });
      toast({ title: 'Access Granted', description: 'Employee menu access override added' });
      setSelectedUserId('');
      setSelectedMenuKey('');
      setOverrideSearch('');
    } catch {
      toast({ title: 'Error', description: 'Failed to grant access', variant: 'destructive' });
    }
  };

  const handleRevokeAccess = async (menuKey: string, userId: string) => {
    try {
      await revokeUserMenuAccess.mutateAsync({ menuKey, userId });
      toast({ title: 'Revoked', description: 'Employee menu access removed' });
    } catch {
      toast({ title: 'Error', description: 'Failed to revoke access', variant: 'destructive' });
    }
  };

  const isLoading = menuLoading || profilesLoading;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  // Group configs by section
  const sections = configs.reduce<Record<string, MenuAccessConfig[]>>((acc, c) => {
    (acc[c.section] ||= []).push(c);
    return acc;
  }, {});

  const sectionOrder = ['main', 'manager', 'hr_pms', 'management', 'audit', 'admin', 'dataEntry', 'reports'];

  return (
    <Tabs defaultValue="profiles" className="space-y-4">
      <TabsList className="flex-wrap h-auto gap-1">
        <TabsTrigger value="profiles"><Settings2 className="h-4 w-4 mr-1" />Profiles</TabsTrigger>
        <TabsTrigger value="mapping"><Shield className="h-4 w-4 mr-1" />Profile Mapping</TabsTrigger>
        <TabsTrigger value="assignment"><Users className="h-4 w-4 mr-1" />Assignment</TabsTrigger>
        <TabsTrigger value="role-access"><Menu className="h-4 w-4 mr-1" />Role Access</TabsTrigger>
        <TabsTrigger value="overrides"><UserPlus className="h-4 w-4 mr-1" />Employee Overrides</TabsTrigger>
      </TabsList>

      {/* Tab 1: Profiles */}
      <TabsContent value="profiles">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Settings2 className="h-5 w-5" />Access Profiles</CardTitle>
            <CardDescription>Create and manage named permission profiles.</CardDescription>
          </CardHeader>
          <CardContent>
            <ProfilesTab
              profiles={profiles}
              assignments={assignments}
              createProfile={createProfile}
              updateProfile={updateProfile}
              deleteProfile={deleteProfile}
              toast={toast}
            />
          </CardContent>
        </Card>
      </TabsContent>

      {/* Tab 2: Profile Mapping */}
      <TabsContent value="mapping">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" />Profile Mapping</CardTitle>
            <CardDescription>Map org scope and menu rights per profile.</CardDescription>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
      </TabsContent>

      {/* Tab 3: Assignment */}
      <TabsContent value="assignment">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Profile Assignments</CardTitle>
            <CardDescription>Assign access profiles to individual employees.</CardDescription>
          </CardHeader>
          <CardContent>
            <AssignmentTab
              profiles={profiles}
              assignments={assignments}
              assignUser={assignUser}
              removeAssignment={removeAssignment}
              toast={toast}
            />
          </CardContent>
        </Card>
      </TabsContent>

      {/* Tab 4: Role Access */}
      <TabsContent value="role-access">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Menu className="h-5 w-5" />
              Menu Access Rights
            </CardTitle>
            <CardDescription>
              Control which roles can see each sidebar menu item. Changes take effect immediately after save.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border max-h-[60vh] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead className="w-[200px]">Menu Item</TableHead>
                    <TableHead className="w-[100px]">Section</TableHead>
                    {ALL_APP_ROLES.map(role => (
                      <TableHead key={role} className="text-center w-[90px]">
                        {ROLE_LABELS[role]}
                      </TableHead>
                    ))}
                    <TableHead className="w-[80px] text-center">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sectionOrder.map(sectionKey => {
                    const items = sections[sectionKey];
                    if (!items?.length) return null;
                    return items.map((config, idx) => {
                      const roles = getEditedRoles(config);
                      const changed = hasChanges(config);
                      return (
                        <TableRow key={config.id}>
                          <TableCell className="font-medium">
                            {idx === 0 && (
                              <Badge variant="outline" className="mr-2 text-[10px]">
                                {SECTION_LABELS[sectionKey] || sectionKey}
                              </Badge>
                            )}
                            {config.menu_name}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {SECTION_LABELS[config.section] || config.section}
                          </TableCell>
                          {ALL_APP_ROLES.map(role => {
                            const isLocked = config.menu_key === 'admin-settings' && role === 'admin';
                            return (
                              <TableCell key={role} className="text-center">
                                <Checkbox
                                  checked={roles.includes(role)}
                                  onCheckedChange={() => toggleRole(config.menu_key, role, roles)}
                                  disabled={isLocked}
                                  aria-label={`${role} access to ${config.menu_name}`}
                                />
                              </TableCell>
                            );
                          })}
                          <TableCell className="text-center">
                            <Button
                              size="sm"
                              variant={changed ? 'default' : 'ghost'}
                              disabled={!changed || savingKey === config.menu_key}
                              onClick={() => handleSave(config)}
                              className="h-7 px-2"
                            >
                              <Save className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    });
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* Tab 5: Employee Overrides */}
      <TabsContent value="overrides">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Employee-Level Overrides
            </CardTitle>
            <CardDescription>
              Grant specific menu items to individual employees regardless of their role.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 items-end">
              <div className="flex-1 space-y-1.5">
                <label className="text-sm font-medium">Employee</label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or code..."
                    value={overrideSearch}
                    onChange={e => setOverrideSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                {overrideSearch && (
                  <div className="border rounded-md max-h-40 overflow-y-auto bg-background">
                    {filteredProfiles.map(p => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setSelectedUserId(p.id);
                          setOverrideSearch(
                            p.employee_code
                              ? `${p.full_name || p.email} (${p.employee_code})`
                              : (p.full_name || p.email || '')
                          );
                        }}
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors"
                      >
                        {p.full_name || p.email}
                        {p.employee_code && <span className="text-muted-foreground ml-1">({p.employee_code})</span>}
                      </button>
                    ))}
                    {filteredProfiles.length === 0 && (
                      <p className="text-xs text-muted-foreground px-3 py-2">No results</p>
                    )}
                  </div>
                )}
              </div>
              <div className="w-full sm:w-56 space-y-1.5">
                <label className="text-sm font-medium">Menu Item</label>
                <Select value={selectedMenuKey} onValueChange={setSelectedMenuKey}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select menu..." />
                  </SelectTrigger>
                  <SelectContent>
                    {configs.map(c => (
                      <SelectItem key={c.menu_key} value={c.menu_key}>
                        {c.menu_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleGrantAccess} disabled={!selectedUserId || !selectedMenuKey || grantUserMenuAccess.isPending}>
                <UserPlus className="h-4 w-4 mr-1" />
                Grant
              </Button>
            </div>

            {enrichedOverrides.length > 0 ? (
              <div className="rounded-md border max-h-[60vh] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-background">
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Menu Item</TableHead>
                      <TableHead>Granted</TableHead>
                      <TableHead className="w-[80px] text-center">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {enrichedOverrides.map(o => (
                      <TableRow key={o.id}>
                        <TableCell className="font-medium">
                          {o.userName}
                          {o.employeeCode && <span className="text-muted-foreground ml-1 text-xs">({o.employeeCode})</span>}
                        </TableCell>
                        <TableCell>{o.menuName}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(o.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-destructive hover:text-destructive"
                            onClick={() => handleRevokeAccess(o.menu_key, o.user_id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No employee-level overrides configured yet.
              </p>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
