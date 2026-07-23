import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type DirectoryAccessScope = 'all' | 'bu' | 'department' | 'team';
export type AssistScope = 'all' | 'bu' | 'department' | 'team' | 'direct' | 'none';

export interface AssistBlock {
  canAssist: boolean;
  scope: AssistScope;
  businessUnitIds: string[];
  departmentIds: string[];
  source: string | null;
}

export interface DirectoryAccess {
  canAccess: boolean;
  scope: DirectoryAccessScope | null;
  businessUnitId: string | null;
  businessUnitIds: string[];
  departmentIds: string[];
  canAssist: boolean;
  source: string | null;
  assist: AssistBlock;
}

const DENY: DirectoryAccess = {
  canAccess: false, scope: null, businessUnitId: null, businessUnitIds: [],
  departmentIds: [],
  canAssist: false, source: null,
  assist: { canAssist: false, scope: 'none', businessUnitIds: [], departmentIds: [], source: null },
};

/**
 * Resolves the current user's access to the Annual Review "All employees"
 * directory. Server is the SSOT — the same resolver gates the RPCs
 * `search_active_employees_for_review` and `create_or_get_annual_review_instance`.
 *
 * See POLICY §AR-DIRECTORY-ACCESS-MATRIX.
 */
export function useDirectoryAccess(): DirectoryAccess & { isLoading: boolean } {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['annual-review', 'directory-access', user?.id ?? null],
    enabled: Boolean(user?.id),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<DirectoryAccess> => {
      const { data, error } = await supabase.rpc(
        'get_annual_review_directory_access' as never,
      );
      if (error) return DENY;
      const row = (data ?? {}) as {
        can_access?: boolean;
        scope?: DirectoryAccessScope;
        business_unit_id?: string | null;
        business_unit_ids?: string[] | null;
        department_ids?: string[] | null;
        can_assist?: boolean;
        source?: string | null;
        assist?: {
          can_assist?: boolean;
          scope?: AssistScope;
          business_unit_ids?: string[] | null;
          department_ids?: string[] | null;
          source?: string | null;
        };
      };
      if (!row.can_access) return DENY;
      const ids = Array.isArray(row.business_unit_ids) && row.business_unit_ids.length > 0
        ? row.business_unit_ids
        : (row.business_unit_id ? [row.business_unit_id] : []);
      const deptIds = Array.isArray(row.department_ids) ? row.department_ids : [];
      const assist: AssistBlock = row.assist
        ? {
            canAssist: Boolean(row.assist.can_assist),
            scope: (row.assist.scope ?? 'none') as AssistScope,
            businessUnitIds: Array.isArray(row.assist.business_unit_ids) ? row.assist.business_unit_ids : [],
            departmentIds: Array.isArray(row.assist.department_ids) ? row.assist.department_ids : [],
            source: row.assist.source ?? null,
          }
        : {
            canAssist: row.can_assist !== false,
            scope: (row.scope ?? 'none') as AssistScope,
            businessUnitIds: ids,
            departmentIds: deptIds,
            source: row.source ?? null,
          };
      return {
        canAccess: true,
        scope: row.scope ?? 'all',
        businessUnitId: row.business_unit_id ?? null,
        businessUnitIds: ids,
        departmentIds: deptIds,
        canAssist: row.can_assist !== false,
        source: row.source ?? null,
        assist,
      };
    },
  });
  return { ...(data ?? DENY), isLoading };
}
