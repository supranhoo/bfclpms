import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type DirectoryAccessScope = 'all' | 'bu';

export interface DirectoryAccess {
  canAccess: boolean;
  scope: DirectoryAccessScope | null;
  businessUnitId: string | null;
}

const DENY: DirectoryAccess = { canAccess: false, scope: null, businessUnitId: null };

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
      };
      if (!row.can_access) return DENY;
      return {
        canAccess: true,
        scope: row.scope ?? 'all',
        businessUnitId: row.business_unit_id ?? null,
      };
    },
  });
  return { ...(data ?? DENY), isLoading };
}
