/**
 * Shared RBAC helper for incentive edge functions.
 *
 * Checks access in two tiers:
 *  1. Privileged roles: admin, hr_pms → always allowed
 *  2. Menu override: any role (employee, manager, etc.) with the specified
 *     menu_access_user_overrides key → allowed
 *
 * This makes incentive function access fully configurable via the
 * Menu Access Rights UI without code changes or redeployments.
 *
 * @see POLICY.md §73
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface IncentiveAuthResult {
  authorized: boolean;
  user: { id: string; email?: string } | null;
  error?: string;
  status?: number;
}

const PRIVILEGED_ROLES = ['admin', 'hr_pms'];

export async function checkIncentiveAccess(
  supabase: SupabaseClient,
  authHeader: string | null,
  menuKeys: string | string[],
): Promise<IncentiveAuthResult> {
  const keysArray = Array.isArray(menuKeys) ? menuKeys : [menuKeys];
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { authorized: false, user: null, error: 'Unauthorized', status: 401 };
  }

  const token = authHeader.replace('Bearer ', '');

  // Service-role token bypasses all checks (used by cron / internal calls)
  if (token === serviceKey) {
    return { authorized: true, user: { id: 'service-role' } };
  }

  // Validate JWT and extract user
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return { authorized: false, user: null, error: 'Unauthorized', status: 401 };
  }

  // Tier 1: Check privileged roles
  const { data: roles } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .in('role', PRIVILEGED_ROLES);

  if (roles && roles.length > 0) {
    return { authorized: true, user: { id: user.id, email: user.email } };
  }

  // Tier 2: Check menu override (role-agnostic — works for any base role)
  const { data: overrides } = await supabase
    .from('menu_access_user_overrides')
    .select('id')
    .eq('user_id', user.id)
    .in('menu_key', keysArray)
    .limit(1);

  if (overrides && overrides.length > 0) {
    return { authorized: true, user: { id: user.id, email: user.email } };
  }

  return {
    authorized: false,
    user: { id: user.id, email: user.email },
    error: 'Admin, HR PMS, or menu override access required',
    status: 403,
  };
}
