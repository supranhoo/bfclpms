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
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@5.9.6';

export interface AdminAuthResult {
  authorized: boolean;
  user: { id: string; email?: string } | null;
  adminClient: SupabaseClient | null;
  error?: string;
  status?: number;
}

type VerifiedAdminUser = { id: string; email?: string };

interface AdminAuthDependencies {
  verifyUser?: (token: string, supabaseUrl: string) => Promise<VerifiedAdminUser>;
  createAdminClient?: (supabaseUrl: string, serviceRoleKey: string) => SupabaseClient;
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(issuer: string) {
  const cached = jwksCache.get(issuer);
  if (cached) return cached;

  const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  jwksCache.set(issuer, jwks);
  return jwks;
}

export async function verifyAdminJwt(token: string, supabaseUrl: string): Promise<VerifiedAdminUser> {
  const issuer = `${supabaseUrl}/auth/v1`;
  const { payload } = await jwtVerify(token, getJwks(issuer), {
    issuer,
    audience: 'authenticated',
  });

  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new Error('Missing sub claim');
  }

  return {
    id: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : undefined,
  };
}

export async function requireAdminUser(req: Request, deps: AdminAuthDependencies = {}): Promise<AdminAuthResult> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
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
    user = await (deps.verifyUser ?? verifyAdminJwt)(token, supabaseUrl);
  } catch (error) {
    console.warn('[admin-auth] Identity validation failed:', error instanceof Error ? error.message : String(error));
    return { authorized: false, user: null, adminClient: null, error: 'Unauthorized', status: 401 };
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
