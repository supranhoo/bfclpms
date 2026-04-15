import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface AccessProfile {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

export interface AccessProfileOrgScope {
  id: string;
  profile_id: string;
  company_id: string | null;
  division_id: string | null;
  business_unit_id: string | null;
  department_id: string | null;
  location: string | null;
  designation: string | null;
  pms_grade: string | null;
  level: string | null;
}

export interface AccessProfileMenuRight {
  id: string;
  profile_id: string;
  menu_key: string;
  can_view: boolean;
  can_add: boolean;
  can_update: boolean;
  can_delete: boolean;
}

export interface AccessProfileAssignment {
  id: string;
  profile_id: string;
  user_id: string;
  assigned_by: string | null;
  created_at: string;
}

export function useAccessProfiles() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: profiles = [], isLoading: profilesLoading } = useQuery({
    queryKey: ['access-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('access_profiles')
        .select('*')
        .order('name');
      if (error) throw error;
      return data as AccessProfile[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: orgScopes = [], isLoading: scopesLoading } = useQuery({
    queryKey: ['access-profile-org-scopes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('access_profile_org_scope')
        .select('*');
      if (error) throw error;
      return data as AccessProfileOrgScope[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: menuRights = [], isLoading: rightsLoading } = useQuery({
    queryKey: ['access-profile-menu-rights'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('access_profile_menu_rights')
        .select('*');
      if (error) throw error;
      return data as AccessProfileMenuRight[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: assignments = [], isLoading: assignmentsLoading } = useQuery({
    queryKey: ['access-profile-assignments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('access_profile_assignments')
        .select('*');
      if (error) throw error;
      return data as AccessProfileAssignment[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['access-profiles'] });
    queryClient.invalidateQueries({ queryKey: ['access-profile-org-scopes'] });
    queryClient.invalidateQueries({ queryKey: ['access-profile-menu-rights'] });
    queryClient.invalidateQueries({ queryKey: ['access-profile-assignments'] });
  };

  const createProfile = useMutation({
    mutationFn: async ({ name, description }: { name: string; description?: string }) => {
      const { data, error } = await supabase
        .from('access_profiles')
        .insert({ name, description: description || null, created_by: user?.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidateAll(),
  });

  const updateProfile = useMutation({
    mutationFn: async ({ id, name, description, is_active }: { id: string; name?: string; description?: string; is_active?: boolean }) => {
      const updates: Record<string, any> = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (is_active !== undefined) updates.is_active = is_active;
      const { error } = await supabase.from('access_profiles').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidateAll(),
  });

  const deleteProfile = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('access_profiles').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidateAll(),
  });

  const saveOrgScope = useMutation({
    mutationFn: async ({ profileId, scope }: {
      profileId: string;
      scope: Omit<AccessProfileOrgScope, 'id' | 'profile_id'>;
    }) => {
      const { error } = await supabase
        .from('access_profile_org_scope')
        .insert({ profile_id: profileId, ...scope });
      if (error) throw error;
    },
    onSuccess: () => invalidateAll(),
  });

  const deleteOrgScope = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('access_profile_org_scope').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidateAll(),
  });

  const saveMenuRights = useMutation({
    mutationFn: async ({ profileId, rights }: {
      profileId: string;
      rights: { menu_key: string; can_view: boolean; can_add: boolean; can_update: boolean; can_delete: boolean }[];
    }) => {
      // Delete existing then insert
      const { error: delErr } = await supabase
        .from('access_profile_menu_rights')
        .delete()
        .eq('profile_id', profileId);
      if (delErr) throw delErr;

      const toInsert = rights
        .filter(r => r.can_view || r.can_add || r.can_update || r.can_delete)
        .map(r => ({ profile_id: profileId, ...r }));

      if (toInsert.length > 0) {
        const { error } = await supabase
          .from('access_profile_menu_rights')
          .insert(toInsert);
        if (error) throw error;
      }
    },
    onSuccess: () => invalidateAll(),
  });

  const assignUser = useMutation({
    mutationFn: async ({ profileId, userId }: { profileId: string; userId: string }) => {
      const { error } = await supabase
        .from('access_profile_assignments')
        .upsert({ profile_id: profileId, user_id: userId, assigned_by: user?.id }, { onConflict: 'profile_id,user_id' });
      if (error) throw error;
    },
    onSuccess: () => invalidateAll(),
  });

  const removeAssignment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('access_profile_assignments').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidateAll(),
  });

  return {
    profiles,
    orgScopes,
    menuRights,
    assignments,
    isLoading: profilesLoading || scopesLoading || rightsLoading || assignmentsLoading,
    createProfile,
    updateProfile,
    deleteProfile,
    saveOrgScope,
    deleteOrgScope,
    saveMenuRights,
    assignUser,
    removeAssignment,
  };
}
