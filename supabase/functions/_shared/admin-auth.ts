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

type VerifiedAdminUser = { id: string; email?: string };

interface AdminAuthDependencies {
  verifyUser?: (token: string, supabaseUrl: string, anonKey: string, authHeader: string) => Promise<VerifiedAdminUser>;
  createAdminClient?: (supabaseUrl: string, serviceRoleKey: string) => SupabaseClient;
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length < 2) {
    throw new Error('Malformed JWT');
  }

  const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const json = atob(padded);
  return JSON.parse(json) as Record<string, unknown>;
}

export async function verifyAdminJwt(token: string, supabaseUrl: string, anonKey: string, authHeader: string): Promise<VerifiedAdminUser> {
  const roleResponse = await fetch(
    `${supabaseUrl}/rest/v1/user_roles?select=user_id,role&role=eq.admin&limit=1`,
    {
      method: 'GET',
      headers: {
        Authorization: authHeader,
        apikey: anonKey,
        'Content-Type': 'application/json',
        'Accept-Profile': 'public',
      },
    },
  );

  if (!roleResponse.ok) {
    const raw = await roleResponse.text();
    throw new Error(raw || `Role verification failed (${roleResponse.status})`);
  }

  const roleRows = await roleResponse.json() as Array<{ user_id: string; role: string }>;
  const roleCheck = roleRows[0];

  if (!roleCheck?.user_id) {
    throw new Error('Admin access required');
  }

  const payload = decodeJwtPayload(token);
  if (payload.sub !== roleCheck.user_id) {
    throw new Error('JWT subject mismatch');
  }

  return {
    id: roleCheck.user_id,
    email: typeof payload.email === 'string' ? payload.email : undefined,
  };
}

export async function requireAdminUser(req: Request, deps: AdminAuthDependencies = {}): Promise<AdminAuthResult> {
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

  // Step 2: Validate JWT signature + claims without depending on an auth session lookup.
  let user: VerifiedAdminUser;
  try {
    user = await (deps.verifyUser ?? verifyAdminJwt)(token, supabaseUrl, anonKey, authHeader);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('[admin-auth] Identity validation failed:', message);
    return {
      authorized: false,
      user: null,
      adminClient: null,
      error: message === 'Admin access required' ? 'Admin access required' : 'Unauthorized',
      status: message === 'Admin access required' ? 403 : 401,
    };
  }

  // Step 3: Verify admin role via service-role client
  const adminClient = (deps.createAdminClient ?? ((url, key) => createClient(url, key)))(supabaseUrl, serviceRoleKey);

  const { data: roleCheck, error: roleError } = await adminClient
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .maybeSingle();

  if (roleError) {
    console.error('[admin-auth] Role lookup failed:', roleError.message);
    return {
      authorized: false,
      user,
      adminClient: null,
      error: 'Authorization check failed',
      status: 500,
    };
  }

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
