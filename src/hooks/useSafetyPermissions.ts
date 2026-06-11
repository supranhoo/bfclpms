import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * useSafetyPermissions
 * --------------------
 * Single round-trip to `get_safety_permissions(uid)`; returns a Set of
 * allowed permission keys plus a `can(key)` helper. Cached for 5 minutes.
 *
 * Fail-open: if the RPC errors (transient DB issue, missing seed, etc.)
 * we return `null` and consumers default to ALLOW so a broken resolver
 * does not lock users out. Server-side RLS remains the authoritative gate.
 */

export interface SafetyPermissionsSnapshot {
  loading: boolean;
  ready: boolean;
  allowed: Set<string> | null;
  can: (key: string) => boolean;
}

export function useSafetyPermissions(): SafetyPermissionsSnapshot {
  const { user } = useAuth();

  const q = useQuery({
    queryKey: ['safety', 'permissions', user?.id ?? 'anon'],
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as unknown as (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: Array<{ permission_key: string; allowed: boolean }> | null; error: { message: string } | null }>)(
        'get_safety_permissions',
        { _user_id: user!.id },
      );
      if (error) throw new Error(error.message);
      const set = new Set<string>();
      (data ?? []).forEach((r) => {
        if (r.allowed) set.add(r.permission_key);
      });
      return set;
    },
  });

  const allowed = q.data ?? null;

  return {
    loading: q.isLoading,
    ready: !q.isLoading && (q.isSuccess || q.isError),
    allowed,
    can: (key: string) => {
      // Fail-closed: until we have a verified snapshot, deny.
      // `nav.home` is universal so the Safety hub landing stays reachable.
      if (!allowed) return key === 'nav.home';
      return allowed.has(key);
    },
  };
}