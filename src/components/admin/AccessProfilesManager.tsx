import { Fragment } from 'react';
import { useState, useMemo, useEffect, useCallback } from 'react';
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
import { ReviewNotesAccessInline } from './ReviewNotesAccessInline';
import { useMenuAccess, type MenuAccessConfig } from '@/hooks/useMenuAccess';
import { useMenuRegistryAdmin } from '@/hooks/useResolvedMenu';
import { applyOverrides, groupByParent } from '@/lib/menu/applyOverrides';
import type { ResolvedMenuNode } from '@/lib/menu/types';
import { useCompanies } from '@/hooks/useCompanies';
import { useDivisions, useBusinessUnits, useDepartments, useSubBranches } from '@/hooks/useOrganization';
import { useEmployeeFilterOptions } from '@/hooks/useEmployeeFilterOptions';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { OrgFilterCombobox, type ComboboxOption } from './OrgFilterCombobox';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';
import { fetchAllPaged } from '@/lib/fetchAll';
import { useAuth } from '@/contexts/AuthContext';
import { useProfilesVersion } from '@/hooks/useProfilesVersion';

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
export function ProfilesTab({ profiles, assignments, createProfile, updateProfile, deleteProfile, toast }: any) {
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
        <div className="rounded-md border max-h-[60vh] overflow-auto [&>div]:overflow-visible">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
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
export function MappingTab({ profiles, orgScopes, menuRights, configs, saveOrgScope, deleteOrgScope, saveMenuRights, toast }: any) {
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [rightsSearch, setRightsSearch] = useState('');
  // Admin always loads the full menu registry + overrides so Level 2/3/4
  // tabs (Organization sub-tabs, Workflow Config sub-tabs, custom menus)
  // appear in the Menu Access Rights grid — independent of the
  // `menu_overrides_enabled` feature flag.
  const { registry: registryQ, overrides: overridesQ } = useMenuRegistryAdmin();
  const resolvedNodes: ResolvedMenuNode[] = useMemo(() => {
    return applyOverrides(registryQ.data ?? [], overridesQ.data ?? []);
  }, [registryQ.data, overridesQ.data]);
  const nodeByKey = useMemo(() => {
    const m = new Map<string, ResolvedMenuNode>();
    for (const n of resolvedNodes) m.set(n.menu_key, n);
    return m;
  }, [resolvedNodes]);
  const childrenByParent = useMemo(() => groupByParent(resolvedNodes), [resolvedNodes]);
  const configByKey = useMemo(() => {
    const m = new Map<string, MenuAccessConfig>();
    for (const c of configs as MenuAccessConfig[]) m.set(c.menu_key, c);
    return m;
  }, [configs]);
  const { data: companies = [] } = useCompanies();
  const { data: divisions = [] } = useDivisions();
  const { data: businessUnits = [] } = useBusinessUnits();
  const { data: departments = [] } = useDepartments();
  const { data: subBranches = [] } = useSubBranches();
  const { designations, grades } = useEmployeeFilterOptions();

  // Levels from profiles
  const { data: levels = [] } = useQuery({
    queryKey: ['distinct-levels'],
    queryFn: async () => {
      // Paged fetch — bypasses PostgREST's 1000-row default cap so distinct
      // levels from rows beyond row 1000 are not silently dropped.
      const data = await fetchAllPaged<{ level: string | null }>((from, to) =>
        supabase
          .from('profiles')
          .select('level')
          .eq('is_active', true)
          .not('level', 'is', null)
          .range(from, to)
      );
      return [...new Set(data.map(p => p.level))].filter(Boolean).sort() as string[];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Org scope form state — arrays for multi-select
  const [scopeForm, setScopeForm] = useState<{
    company_id: string[]; division_id: string[]; business_unit_id: string[];
    department_id: string[]; location: string[]; designation: string[]; pms_grade: string[]; level: string[];
  }>({
    company_id: [], division_id: [], business_unit_id: [],
    department_id: [], location: [], designation: [], pms_grade: [], level: [],
  });

  // Menu rights editing
  const profileMenuRights = useMemo(() => {
    if (!selectedProfileId) return new Map<string, AccessProfileMenuRight>();
    const map = new Map<string, AccessProfileMenuRight>();
    menuRights.filter((r: any) => r.profile_id === selectedProfileId).forEach((r: any) => map.set(r.menu_key, r));
    return map;
  }, [menuRights, selectedProfileId]);

  const [editedRights, setEditedRights] = useState<Record<string, { can_view: boolean; can_add: boolean; can_update: boolean; can_delete: boolean }>>({});

  // Helper to extract scope form values from saved scopes
  const extractScopeForm = useCallback((profileId: string) => {
    const saved = orgScopes.filter((s: any) => s.profile_id === profileId);
    return {
      company_id: saved.filter((s: any) => s.company_id).map((s: any) => s.company_id),
      division_id: saved.filter((s: any) => s.division_id).map((s: any) => s.division_id),
      business_unit_id: saved.filter((s: any) => s.business_unit_id).map((s: any) => s.business_unit_id),
      department_id: saved.filter((s: any) => s.department_id).map((s: any) => s.department_id),
      location: saved.filter((s: any) => s.location).map((s: any) => s.location),
      designation: saved.filter((s: any) => s.designation).map((s: any) => s.designation),
      pms_grade: saved.filter((s: any) => s.pms_grade).map((s: any) => s.pms_grade),
      level: saved.filter((s: any) => s.level).map((s: any) => s.level),
    };
  }, [orgScopes]);

  // Pre-populate scopeForm when profile changes
  const handleProfileChange = (id: string) => {
    setSelectedProfileId(id);
    setEditedRights({});
    setScopeForm(id ? extractScopeForm(id) : { company_id: [], division_id: [], business_unit_id: [], department_id: [], location: [], designation: [], pms_grade: [], level: [] });
  };

  // Re-sync scopeForm when orgScopes data refreshes (e.g., after save)
  useEffect(() => {
    if (selectedProfileId) {
      setScopeForm(extractScopeForm(selectedProfileId));
    }
  }, [orgScopes, selectedProfileId, extractScopeForm]);

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

  // Cascading filter options
  const companyOptions: ComboboxOption[] = companies.map((c: any) => ({ value: c.id, label: c.name }));
  const divisionOptions: ComboboxOption[] = divisions
    .filter((d: any) => scopeForm.company_id.length === 0 || scopeForm.company_id.includes(d.company_id))
    .map((d: any) => ({ value: d.id, label: d.name }));
  const buOptions: ComboboxOption[] = businessUnits
    .filter((b: any) => scopeForm.division_id.length === 0 || scopeForm.division_id.includes(b.division_id))
    .map((b: any) => ({ value: b.id, label: b.name }));
  const deptOptions: ComboboxOption[] = departments
    .filter((d: any) => scopeForm.business_unit_id.length === 0 || scopeForm.business_unit_id.includes(d.business_unit_id))
    .map((d: any) => ({ value: d.id, label: d.name }));
  const locationOptions: ComboboxOption[] = subBranches
    .filter((s: any) => scopeForm.department_id.length === 0 || scopeForm.department_id.includes(s.department_id))
    .map((s: any) => ({ value: s.id, label: s.name }));
  const designationOptions: ComboboxOption[] = designations.map((d: string) => ({ value: d, label: d }));
  const gradeOptions: ComboboxOption[] = grades.map((g: string) => ({ value: g, label: g }));
  const levelOptions: ComboboxOption[] = levels.map((l: string) => ({ value: l, label: l }));

  const hasScopeFilter = Object.values(scopeForm).some(arr => arr.length > 0);

  // Compare current scopeForm with saved scopes to detect changes
  const isScopeDirty = useMemo(() => {
    if (!selectedProfileId) return false;
    const saved = extractScopeForm(selectedProfileId);
    const keys = Object.keys(scopeForm) as (keyof typeof scopeForm)[];
    return keys.some(k => {
      const a = [...scopeForm[k]].sort();
      const b = [...saved[k]].sort();
      return a.length !== b.length || a.some((v, i) => v !== b[i]);
    });
  }, [scopeForm, selectedProfileId, extractScopeForm]);

  const handleSaveScope = async () => {
    if (!selectedProfileId) return;
    try {
      // Build independent dimension rows
      const rows: any[] = [];
      const dimensionMap: { key: string; values: string[] }[] = [
        { key: 'company_id', values: scopeForm.company_id },
        { key: 'division_id', values: scopeForm.division_id },
        { key: 'business_unit_id', values: scopeForm.business_unit_id },
        { key: 'department_id', values: scopeForm.department_id },
        { key: 'location', values: scopeForm.location },
        { key: 'designation', values: scopeForm.designation },
        { key: 'pms_grade', values: scopeForm.pms_grade },
        { key: 'level', values: scopeForm.level },
      ];

      for (const dim of dimensionMap) {
        for (const val of dim.values) {
          const row: any = {
            company_id: null, division_id: null, business_unit_id: null,
            department_id: null, location: null, designation: null,
            pms_grade: null, level: null,
          };
          row[dim.key] = val;
          rows.push(row);
        }
      }

      if (rows.length > 500) {
        toast({ title: 'Too many scope entries', description: `Selection would create ${rows.length} rows. Please reduce selections.`, variant: 'destructive' });
        return;
      }

      // Delete all existing scopes for this profile first
      for (const s of profileScopes) {
        await deleteOrgScope.mutateAsync(s.id);
      }

      // Insert new scopes if any
      if (rows.length > 0) {
        await saveOrgScope.mutateAsync({ profileId: selectedProfileId, scopes: rows });
      }

      toast({ title: 'Org Scope Saved', description: rows.length > 0 ? `${rows.length} scope ${rows.length === 1 ? 'entry' : 'entries'} configured` : 'All scopes cleared' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const handleSaveRights = async () => {
    if (!selectedProfileId) return;
    // Build a union of every menu_key we know about so saving never wipes
    // rights for rows that are not currently visible (hidden by search,
    // not yet in configs, or only present in the registry / existing
    // saved rights). Storage layer skips entries with no granted rights.
    const allKeys = new Set<string>();
    for (const c of configs as MenuAccessConfig[]) allKeys.add(c.menu_key);
    for (const n of resolvedNodes) allKeys.add(n.menu_key);
    for (const k of profileMenuRights.keys()) allKeys.add(k);
    for (const k of Object.keys(editedRights)) allKeys.add(k);
    const allRights = Array.from(allKeys).map(menu_key => {
      const r = editedRights[menu_key] || (() => {
        const ex = profileMenuRights.get(menu_key);
        return ex ? { can_view: ex.can_view, can_add: ex.can_add, can_update: ex.can_update, can_delete: ex.can_delete } : { can_view: false, can_add: false, can_update: false, can_delete: false };
      })();
      return { menu_key, ...r };
    });
    try {
      await saveMenuRights.mutateAsync({ profileId: selectedProfileId, rights: allRights });
      toast({ title: 'Menu Rights Saved' });
      setEditedRights({});
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  // Group configs by section — used only for the "Legacy / unmapped" tail
  // (rows in menu_access_config that have no corresponding menu_registry entry).
  const sections = (configs as MenuAccessConfig[])
    .filter(c => !nodeByKey.has(c.menu_key))
    .reduce<Record<string, MenuAccessConfig[]>>((acc, c) => {
      (acc[c.section] ||= []).push(c);
      return acc;
    }, {});

  // Flatten the resolved menu tree depth-first so the rights grid mirrors
  // sidebar + System Settings hierarchy (Level 2 → Level 3 → Level 4).
  type FlatRow = { node: ResolvedMenuNode; depth: number };
  const flatRows: FlatRow[] = useMemo(() => {
    const out: FlatRow[] = [];
    const visit = (parentKey: string | null, depth: number) => {
      const kids = childrenByParent.get(parentKey) ?? [];
      for (const n of kids) {
        out.push({ node: n, depth });
        visit(n.menu_key, depth + 1);
      }
    };
    visit(null, 0);
    return out;
  }, [childrenByParent]);

  const matchesSearch = (n: ResolvedMenuNode) => {
    if (!rightsSearch.trim()) return true;
    const q = rightsSearch.toLowerCase();
    return n.label.toLowerCase().includes(q) || n.menu_key.toLowerCase().includes(q);
  };
  // A row is visible if it matches search OR any descendant matches
  // (so parent context stays visible).
  const descendantMatches = useMemo(() => {
    const cache = new Map<string, boolean>();
    const walk = (key: string): boolean => {
      if (cache.has(key)) return cache.get(key)!;
      const kids = childrenByParent.get(key) ?? [];
      const any = kids.some(k => matchesSearch(k) || walk(k.menu_key));
      cache.set(key, any);
      return any;
    };
    for (const n of resolvedNodes) walk(n.menu_key);
    return cache;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedNodes, childrenByParent, rightsSearch]);

  const visibleFlatRows = flatRows.filter(({ node }) =>
    matchesSearch(node) || descendantMatches.get(node.menu_key)
  );

  // Resolve scope labels
  const getScopeLabel = (scope: any) => {
    const parts: string[] = [];
    if (scope.company_id) parts.push(companies.find((c: any) => c.id === scope.company_id)?.name || scope.company_id);
    if (scope.division_id) parts.push(divisions.find((d: any) => d.id === scope.division_id)?.name || scope.division_id);
    if (scope.business_unit_id) parts.push(businessUnits.find((b: any) => b.id === scope.business_unit_id)?.name || scope.business_unit_id);
    if (scope.department_id) parts.push(departments.find((d: any) => d.id === scope.department_id)?.name || scope.department_id);
    if (scope.location) parts.push(`Loc: ${subBranches.find((s: any) => s.id === scope.location)?.name || scope.location}`);
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
              <OrgFilterCombobox multiSelect values={scopeForm.company_id} onValuesChange={v => setScopeForm(p => ({ ...p, company_id: v, division_id: [], business_unit_id: [], department_id: [], location: [] }))} options={companyOptions} placeholder="Company..." label="Company" />
              <OrgFilterCombobox multiSelect values={scopeForm.division_id} onValuesChange={v => setScopeForm(p => ({ ...p, division_id: v, business_unit_id: [], department_id: [], location: [] }))} options={divisionOptions} placeholder="Division..." label="Division" />
              <OrgFilterCombobox multiSelect values={scopeForm.business_unit_id} onValuesChange={v => setScopeForm(p => ({ ...p, business_unit_id: v, department_id: [], location: [] }))} options={buOptions} placeholder="Business Unit..." label="Business Unit" />
              <OrgFilterCombobox multiSelect values={scopeForm.department_id} onValuesChange={v => setScopeForm(p => ({ ...p, department_id: v, location: [] }))} options={deptOptions} placeholder="Department..." label="Department" />
              <OrgFilterCombobox multiSelect values={scopeForm.location} onValuesChange={v => setScopeForm(p => ({ ...p, location: v }))} options={locationOptions} placeholder="Location..." label="Location" />
              <OrgFilterCombobox multiSelect values={scopeForm.designation} onValuesChange={v => setScopeForm(p => ({ ...p, designation: v }))} options={designationOptions} placeholder="Designation..." label="Designation" />
              <OrgFilterCombobox multiSelect values={scopeForm.pms_grade} onValuesChange={v => setScopeForm(p => ({ ...p, pms_grade: v }))} options={gradeOptions} placeholder="Grade..." label="Grade" />
              <OrgFilterCombobox multiSelect values={scopeForm.level} onValuesChange={v => setScopeForm(p => ({ ...p, level: v }))} options={levelOptions} placeholder="Level..." label="Level" />
              <div className="flex items-end">
                <Button onClick={handleSaveScope} disabled={!isScopeDirty || saveOrgScope.isPending || deleteOrgScope.isPending} className="w-full">
                  <Save className="h-4 w-4 mr-1" />Save Scope
                </Button>
              </div>
            </div>

            {profileScopes.length > 0 && (
              <div className="flex items-center gap-3 mt-2">
                <Badge variant="secondary" className="text-xs px-3 py-1">
                  ✓ {profileScopes.length} scope {profileScopes.length === 1 ? 'entry' : 'entries'} configured
                </Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-destructive hover:text-destructive"
                  onClick={async () => {
                    try {
                      for (const s of profileScopes) {
                        await deleteOrgScope.mutateAsync(s.id);
                      }
                      toast({ title: 'Cleared', description: 'All scope entries removed' });
                    } catch {
                      toast({ title: 'Error', description: 'Failed to clear scopes', variant: 'destructive' });
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />Clear All
                </Button>
              </div>
            )}
          </div>

          {/* Menu Access Rights */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h4 className="text-sm font-semibold">Menu Access Rights</h4>
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search menu name or key..."
                  value={rightsSearch}
                  onChange={e => setRightsSearch(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
            </div>
            <div className="rounded-md border max-h-[60vh] overflow-auto [&>div]:overflow-visible">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead>Menu Item</TableHead>
                    <TableHead className="w-[60px] text-center">Level</TableHead>
                    <TableHead className="w-[220px]">Menu Key</TableHead>
                    <TableHead className="w-[60px] text-center">View</TableHead>
                    <TableHead className="w-[60px] text-center">Add</TableHead>
                    <TableHead className="w-[60px] text-center">Update</TableHead>
                    <TableHead className="w-[60px] text-center">Delete</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Hierarchical rows from the resolved menu registry */}
                  {visibleFlatRows.map(({ node, depth }) => {
                    const r = getRights(node.menu_key);
                    const cfg = configByKey.get(node.menu_key);
                    const hasChildren = (childrenByParent.get(node.menu_key)?.length ?? 0) > 0;
                    // Container = grouping node with no permission config and children.
                    const isContainer = hasChildren && !cfg && !node.route_path;
                    return (
                      <TableRow key={`reg-${node.menu_key}`}>
                        <TableCell className="text-sm">
                          <span style={{ paddingLeft: `${depth * 16}px` }} className="inline-block">
                            {hasChildren && <span className="text-muted-foreground mr-1">▸</span>}
                            <span className={isContainer ? 'font-medium' : ''}>{node.label}</span>
                            {node.is_custom && (
                              <Badge variant="outline" className="ml-2 text-[10px] py-0 px-1">Custom</Badge>
                            )}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary" className="text-[10px] py-0 px-1.5">L{node.menu_level}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-[11px] text-muted-foreground">{node.menu_key}</TableCell>
                        {isContainer ? (
                          <TableCell colSpan={4} className="text-center text-xs text-muted-foreground italic">
                            Container
                          </TableCell>
                        ) : (
                          (['can_view', 'can_add', 'can_update', 'can_delete'] as const).map(field => (
                            <TableCell key={field} className="text-center">
                              <Checkbox checked={r[field]} onCheckedChange={() => toggleRight(node.menu_key, field)} />
                            </TableCell>
                          ))
                        )}
                      </TableRow>
                    );
                  })}

                  {/* Legacy / unmapped menu_access_config rows not present
                      in the registry — preserve original grouped layout. */}
                  {SECTION_ORDER.filter(s => sections[s]?.length).map(section =>
                    <Fragment key={section}>
                    {sections[section]
                      .filter(cfg => !rightsSearch.trim() ||
                        cfg.menu_name.toLowerCase().includes(rightsSearch.toLowerCase()) ||
                        cfg.menu_key.toLowerCase().includes(rightsSearch.toLowerCase()))
                      .map((cfg: MenuAccessConfig) => {
                        const r = getRights(cfg.menu_key);
                        return (
                          <TableRow key={`cfg-${cfg.menu_key}`}>
                            <TableCell className="text-sm">
                              <span className="text-muted-foreground text-[10px] mr-2">[{SECTION_LABELS[section] || section}]</span>
                              {cfg.menu_name}
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline" className="text-[10px] py-0 px-1.5">—</Badge>
                            </TableCell>
                            <TableCell className="font-mono text-[11px] text-muted-foreground">{cfg.menu_key}</TableCell>
                            {(['can_view', 'can_add', 'can_update', 'can_delete'] as const).map(field => (
                              <TableCell key={field} className="text-center">
                                <Checkbox checked={r[field]} onCheckedChange={() => toggleRight(cfg.menu_key, field)} />
                              </TableCell>
                            ))}
                          </TableRow>
                        );
                      })}
                    {section === 'hr_pms' && (
                      <TableRow key="review-notes-access-inline">
                        <TableCell colSpan={7} className="p-0">
                          <ReviewNotesAccessInline />
                        </TableCell>
                      </TableRow>
                    )}
                    </Fragment>
                  )}
                  {visibleFlatRows.length === 0 && Object.keys(sections).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">
                        {registryQ.isLoading ? 'Loading menu…' : 'No menu items match the search.'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-end">
              <Button onClick={handleSaveRights} disabled={saveMenuRights.isPending}>
                <Save className="h-4 w-4 mr-1" />Save Rights
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Tab 3: Assignment ─── */
export function AssignmentTab({ profiles, assignments, assignUser, removeAssignment, toast }: any) {
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const { isReady, user } = useAuth();
  const profilesVersion = useProfilesVersion();

  // Active employees — drive the search picker (preserves core rule: never
  // assign to inactive users by default).
  const { data: activeProfiles = [] } = useQuery({
    queryKey: ['profiles-active-for-assignment', profilesVersion, user?.id],
    queryFn: async () => {
      return await fetchAllPaged<{ id: string; full_name: string | null; employee_code: string | null; email: string | null; is_active: boolean }>(
        (from, to) =>
          supabase
            .from('profiles')
            .select('id, full_name, employee_code, email, is_active')
            .eq('is_active', true)
            .order('full_name')
            .range(from, to)
      );
    },
    enabled: isReady && !!user,
    staleTime: 5 * 60 * 1000,
  });

  // All employees (incl. inactive) — used ONLY for enrichment of historical
  // assignment rows so "Unknown" stops showing for deactivated users, and
  // (opt-in) to broaden the picker when admin toggles "Include inactive".
  const { data: allProfiles = [] } = useQuery({
    queryKey: ['profiles-all-for-assignment-display', profilesVersion, user?.id],
    queryFn: async () => {
      return await fetchAllPaged<{ id: string; full_name: string | null; employee_code: string | null; email: string | null; is_active: boolean }>(
        (from, to) =>
          supabase
            .from('profiles')
            .select('id, full_name, employee_code, email, is_active')
            .order('full_name')
            .range(from, to)
      );
    },
    enabled: isReady && !!user,
    staleTime: 5 * 60 * 1000,
  });

  // Lookup map across the union for enrichment.
  const profileById = useMemo(() => {
    const map = new Map<string, any>();
    for (const p of allProfiles) map.set(p.id, p);
    for (const p of activeProfiles) if (!map.has(p.id)) map.set(p.id, p);
    return map;
  }, [allProfiles, activeProfiles]);

  const searchSource = includeInactive ? allProfiles : activeProfiles;

  const filteredUsers = useMemo(() => {
    if (!searchQuery) {
      // Sort active-first when inactives are included.
      const sorted = includeInactive
        ? [...searchSource].sort((a: any, b: any) => Number(b.is_active) - Number(a.is_active))
        : searchSource;
      return sorted.slice(0, 20);
    }
    const q = searchQuery.toLowerCase();
    const matches = searchSource.filter((p: any) =>
      p.full_name?.toLowerCase().includes(q) ||
      p.employee_code?.toLowerCase().includes(q) ||
      p.email?.toLowerCase().includes(q)
    );
    const sorted = includeInactive
      ? matches.sort((a: any, b: any) => Number(b.is_active) - Number(a.is_active))
      : matches;
    return sorted.slice(0, 20);
  }, [searchSource, searchQuery, includeInactive]);

  const enrichedAssignments = useMemo(() => {
    return assignments.map((a: any) => {
      const profile = profiles.find((p: any) => p.id === a.profile_id);
      const user = profileById.get(a.user_id);
      return {
        ...a,
        profileName: profile?.name || 'Unknown',
        userName: user?.full_name || user?.email || 'Unknown',
        employeeCode: user?.employee_code || '',
        userIsActive: user?.is_active ?? null,
      };
    });
  }, [assignments, profiles, profileById]);

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
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Employee</label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
              <Checkbox
                checked={includeInactive}
                onCheckedChange={(v) => setIncludeInactive(v === true)}
                className="h-3.5 w-3.5"
              />
              Include inactive
            </label>
          </div>
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
                  {p.is_active === false && (
                    <Badge variant="outline" className="ml-2 text-[10px] py-0 px-1 border-amber-500/50 text-amber-700 dark:text-amber-400">
                      Inactive
                    </Badge>
                  )}
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
        <div className="rounded-md border max-h-[60vh] overflow-auto [&>div]:overflow-visible">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
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
                    {a.userIsActive === false && (
                      <Badge variant="outline" className="ml-2 text-[10px] py-0 px-1 border-amber-500/50 text-amber-700 dark:text-amber-400">
                        Inactive
                      </Badge>
                    )}
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
