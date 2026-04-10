/**
 * Shared admin authentication helper for edge functions.
 *
 * Uses the project-standard two-client pattern:
 *   1. userClient (anon key + Authorization header) → validates identity via getUser()
 *   2. adminClient (service role key) → verifies admin role in user_roles
 *
 * This replaces brittle inline getClaims() patterns and ensures consistent
 * auth behaviour across all admin-only edge functions.
 *
 * @see POLICY.md — Edge Function Security Policy
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface AdminAuthResult {
  authorized: boolean;
  user: { id: string; email?: string } | null;
  adminClient: SupabaseClient | null;
  error?: string;
  status?: number;
}

export async function requireAdminUser(req: Request): Promise<AdminAuthResult> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const authHeader = req.headers.get('Authorization');

  // Step 1: Check header presence
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.warn('[admin-auth] Missing or malformed Authorization header');
    return { authorized: false, user: null, adminClient: null, error: 'Unauthorized', status: 401 };
  }

  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) {
    console.warn('[admin-auth] Bearer token was empty');
    return { authorized: false, user: null, adminClient: null, error: 'Unauthorized', status: 401 };
  }

  // Step 2: Validate identity via user-context client
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: claimsData, error: authError } = await userClient.auth.getClaims(token);
  const claims = claimsData?.claims;

  if (authError || !claims?.sub) {
    console.warn('[admin-auth] Identity validation failed:', authError?.message ?? 'no user returned');
    return { authorized: false, user: null, adminClient: null, error: 'Unauthorized', status: 401 };
  }

  const user = {
    id: claims.sub,
    email: typeof claims.email === 'string' ? claims.email : undefined,
  };

  // Step 3: Verify admin role via service-role client
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: roleCheck } = await adminClient
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .maybeSingle();

  if (!roleCheck) {
    console.warn('[admin-auth] User resolved but not admin:', user.id);
    return {
      authorized: false,
      user,
      adminClient: null,
      error: 'Admin access required',
      status: 403,
    };
  }

  console.info('[admin-auth] Admin verified:', user.id);
  return {
    authorized: true,
    user,
    adminClient,
  };
}
