import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { normalizeKpiKey, normalizeText } from '@/lib/orgKpiKey';

/**
 * Check if current user is a data owner for any org-level KPI
 * Used for route access control
 */
export function useIsAnyOrgKpiDataOwner() {
  const { user, effectiveRole } = useAuth();

  return useQuery({
    queryKey: ['is-any-org-kpi-owner', user?.id],
    queryFn: async () => {
      // Admins always have access (only in admin mode)
      if (effectiveRole === 'admin') {
        return true;
      }

      if (!user?.id) {
        return false;
      }

      // Check if user is designated owner for any KPI
      const { data, error } = await supabase
        .from('org_kpi_data_owners')
        .select('id')
        .eq('owner_id', user.id)
        .limit(1);

      if (error) return false;
      return data && data.length > 0;
    },
    enabled: !!user?.id,
  });
}

export interface OrgKpiDataOwner {
  id: string;
  category_id: string;
  kra_name: string;
  kpi_name: string;
  owner_id: string;
  assigned_by: string | null;
  created_at: string;
  // Joined fields
  owner?: {
    id: string;
    full_name: string | null;
    email: string;
  };
}

/**
 * Fetch all data owners for org-level KPIs
 */
export function useOrgKpiDataOwners() {
  const { isReady, user } = useAuth();
  return useQuery({
    queryKey: ['org-kpi-data-owners', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('org_kpi_data_owners')
        .select(`
          *,
          owner:profiles!org_kpi_data_owners_owner_id_fkey(id, full_name, email)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as OrgKpiDataOwner[];
    },
    enabled: isReady && !!user,
  });
}

/**
 * Check if current user can edit a specific org-level KPI
 */
export function useIsOrgKpiDataOwner(categoryId: string, kraName: string, kpiName: string) {
  const { user, effectiveRole, isReady } = useAuth();
  const cleanKra = (kraName || '').replace(/\r/g, '');
  const cleanKpi = (kpiName || '').replace(/\r/g, '');

  return useQuery({
    queryKey: ['org-kpi-owner-check', categoryId, kraName, kpiName, user?.id],
    queryFn: async () => {
      // Admins always have access
      if (effectiveRole === 'admin') {
        return { canEdit: true, isOwner: false, isAdmin: true };
      }

      if (!user?.id) {
        return { canEdit: false, isOwner: false, isAdmin: false };
      }

      // Check if user is designated owner
      const { data } = await supabase
        .from('org_kpi_data_owners')
        .select('id')
        .eq('category_id', categoryId)
        .eq('kra_name', cleanKra)
        .eq('kpi_name', cleanKpi)
        .eq('owner_id', user.id)
        .maybeSingle();

      return { canEdit: !!data, isOwner: !!data, isAdmin: false };
    },
    enabled: isReady && !!user && !!categoryId && !!kraName && !!kpiName,
  });
}

/**
 * Get owners for a specific KPI
 */
export function useOrgKpiOwners(categoryId: string, kraName: string, kpiName: string) {
  const { isReady, user } = useAuth();
  const cleanKra = (kraName || '').replace(/\r/g, '');
  const cleanKpi = (kpiName || '').replace(/\r/g, '');
  return useQuery({
    queryKey: ['org-kpi-owners', categoryId, cleanKra, cleanKpi, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('org_kpi_data_owners')
        .select(`
          *,
          owner:profiles!org_kpi_data_owners_owner_id_fkey(id, full_name, email)
        `)
        .eq('category_id', categoryId)
        .eq('kra_name', cleanKra)
        .eq('kpi_name', cleanKpi);

      if (error) throw error;
      return data as OrgKpiDataOwner[];
    },
    enabled: isReady && !!user && !!categoryId && !!kraName && !!kpiName,
  });
}

/**
 * Build a map of all ownership for quick lookup
 * Key format: categoryId||kraName||kpiName
 */
export function useOrgKpiOwnershipMap() {
  const { data: owners, isLoading } = useOrgKpiDataOwners();
  const { user, effectiveRole } = useAuth();

  const ownershipMap = new Map<string, { owners: OrgKpiDataOwner[]; canEdit: boolean }>();
  
  if (owners) {
    owners.forEach(owner => {
      const key = normalizeKpiKey(owner.category_id, owner.kra_name, owner.kpi_name);
      const existing = ownershipMap.get(key) || { owners: [], canEdit: effectiveRole === 'admin' };
      existing.owners.push(owner);
      if (owner.owner_id === user?.id) {
        existing.canEdit = true;
      }
      ownershipMap.set(key, existing);
    });
  }

  return { ownershipMap, isAdmin: effectiveRole === 'admin', isLoading };
}

/**
 * Assign a data owner to an org-level KPI
 */
export function useAssignOrgKpiOwner() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      categoryId,
      kraName,
      kpiName,
      ownerId,
    }: {
      categoryId: string;
      kraName: string;
      kpiName: string;
      ownerId: string;
    }) => {
      const { data, error } = await supabase
        .from('org_kpi_data_owners')
        .insert({
          category_id: categoryId,
          kra_name: kraName,
          kpi_name: kpiName,
          owner_id: ownerId,
          assigned_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-kpi-data-owners'] });
      queryClient.invalidateQueries({ queryKey: ['org-kpi-owners'] });
      queryClient.invalidateQueries({ queryKey: ['org-kpi-owner-check'] });
      toast({ title: 'Data owner assigned successfully' });
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Failed to assign data owner', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });
}

/**
 * Remove a data owner from an org-level KPI
 */
export function useRemoveOrgKpiOwner() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (ownerId: string) => {
      const { error } = await supabase
        .from('org_kpi_data_owners')
        .delete()
        .eq('id', ownerId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-kpi-data-owners'] });
      queryClient.invalidateQueries({ queryKey: ['org-kpi-owners'] });
      queryClient.invalidateQueries({ queryKey: ['org-kpi-owner-check'] });
      toast({ title: 'Data owner removed' });
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Failed to remove data owner', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });
}

/**
 * Bulk lookup hook: returns a Map of data owner names keyed by `categoryId||kraName||kpiName` (lowercased).
 * Used across scorecards to show "Data Owner: X, Y" badges.
 */
export function useOrgKpiDataOwnerNames() {
  const { isReady, user } = useAuth();
  return useQuery({
    queryKey: ['org-kpi-data-owner-names', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('org_kpi_data_owners')
        .select(`
          category_id,
          kra_name,
          kpi_name,
          owner:profiles!org_kpi_data_owners_owner_id_fkey(full_name)
        `);

      if (error) throw error;

      const map = new Map<string, string[]>();
      for (const row of data || []) {
        const key = normalizeKpiKey(row.category_id, row.kra_name, row.kpi_name);
        const ownerName = (row.owner as any)?.full_name || 'Unknown';
        const existing = map.get(key) || [];
        if (!existing.includes(ownerName)) {
          existing.push(ownerName);
        }
        map.set(key, existing);
      }
      return map;
    },
    enabled: isReady && !!user,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Helper to look up owner names for a specific KPI from the map
 */
export function getOwnerNamesForKpi(
  map: Map<string, string[]> | undefined,
  kpi: { category_id: string; kra_name: string; kpi_name: string }
): string[] {
  if (!map) return [];
  const key = normalizeKpiKey(kpi.category_id, kpi.kra_name, kpi.kpi_name);
  return map.get(key) || [];
}
