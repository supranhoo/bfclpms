import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { requireAdminUser } from '../_shared/admin-auth.ts';

function createRoleClient(result: { data?: { role: string } | null; error?: { message: string } | null }) {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    maybeSingle: async () => ({ data: result.data ?? null, error: result.error ?? null }),
                  };
                },
              };
            },
          };
        },
      };
    },
  } as any;
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
}

Deno.test('requireAdminUser authorizes verified admin JWTs without session lookup dependency', async () => {
  Deno.env.set('SUPABASE_URL', 'https://example.supabase.co');
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service-role');

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => jsonResponse([{ user_id: 'user-123', role: 'admin' }]);

  const result = await requireAdminUser(new Request('https://example.com', {
    headers: { Authorization: 'Bearer valid-jwt' },
  }), {
    verifyUser: async () => ({ id: 'user-123', email: 'admin@example.com' }),
    createAdminClient: () => createRoleClient({ data: { role: 'admin' } }),
  });

  globalThis.fetch = originalFetch;

  assertEquals(result.authorized, true);
  assertEquals(result.user?.id, 'user-123');
  assertEquals(result.user?.email, 'admin@example.com');
});

Deno.test('requireAdminUser returns 500 when role lookup fails', async () => {
  Deno.env.set('SUPABASE_URL', 'https://example.supabase.co');
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service-role');

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => jsonResponse([{ user_id: 'user-123', role: 'admin' }]);

  const result = await requireAdminUser(new Request('https://example.com', {
    headers: { Authorization: 'Bearer valid-jwt' },
  }), {
    verifyUser: async () => ({ id: 'user-123' }),
    createAdminClient: () => createRoleClient({ error: { message: 'db unavailable' } }),
  });

  globalThis.fetch = originalFetch;

  assertEquals(result.authorized, false);
  assertEquals(result.status, 500);
  assertEquals(result.error, 'Authorization check failed');
});