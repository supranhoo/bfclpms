// Edge function: grant-safety-role (verify_jwt=false, auth validated in code)
// Auto-provisions auth.users for backfilled profiles before inserting safety_user_roles.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SAFETY_ROLES = ['admin', 'safety_head', 'safety_officer', 'bu_head', 'manager', 'supervisor', 'worker', 'auditor'];

function randomPassword(len = 16) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  let out = '';
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  for (let i = 0; i < len; i++) out += chars[arr[i] % chars.length];
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

    // ---- Auth caller ----
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Missing authorization header' }, 401);
    }
    const anon = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authErr } = await anon.auth.getUser();
    if (authErr || !user) return json({ error: 'Invalid token' }, 401);

    // Caller must be PMS admin OR existing Safety admin
    const [{ data: pmsRole }, { data: safetyAdmin }] = await Promise.all([
      admin.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle(),
      admin.from('safety_user_roles').select('id').eq('user_id', user.id).eq('role', 'admin').maybeSingle(),
    ]);
    if (!pmsRole && !safetyAdmin) {
      return json({ error: 'Unauthorized — admin access required' }, 403);
    }

    // ---- Body ----
    const body = await req.json().catch(() => ({}));
    const { user_id, role, business_unit_id, department_id } = body ?? {};
    if (!user_id || typeof user_id !== 'string') return json({ error: 'user_id is required' }, 400);
    if (!role || !SAFETY_ROLES.includes(role)) return json({ error: 'Invalid role' }, 400);

    // ---- Load target profile ----
    const { data: profile, error: pErr } = await admin
      .from('profiles')
      .select('id, email, full_name, employee_code, has_real_email, is_active')
      .eq('id', user_id)
      .maybeSingle();
    if (pErr) return json({ error: pErr.message }, 500);
    if (!profile) return json({ error: 'Target profile not found' }, 404);
    if (profile.is_active === false) return json({ error: 'Target user is deactivated' }, 409);

    // ---- Provision auth.users if missing ----
    let authAction: 'created' | 'existing' = 'existing';
    const { data: existing } = await admin.auth.admin.getUserById(profile.id);
    if (!existing?.user) {
      if (!profile.email || !profile.has_real_email) {
        return json({
          error: 'This user has no real email on file. Add an email in User Management before granting a Safety role.',
        }, 409);
      }
      const { error: cErr } = await admin.auth.admin.createUser({
        id: profile.id,
        email: profile.email,
        password: randomPassword(16),
        email_confirm: true,
        user_metadata: {
          full_name: profile.full_name ?? '',
          employee_code: profile.employee_code ?? '',
        },
      });
      if (cErr) return json({ error: `Auth provisioning failed: ${cErr.message}` }, 500);
      await admin.from('profiles').update({ portal_access: true }).eq('id', profile.id);
      authAction = 'created';
    }

    // ---- Insert the safety role ----
    const { error: iErr } = await admin.from('safety_user_roles').insert({
      user_id: profile.id,
      role,
      business_unit_id: business_unit_id ?? null,
      department_id: department_id ?? null,
      assigned_by: user.id,
    });
    if (iErr) return json({ error: iErr.message }, 500);

    return json({ ok: true, auth_action: authAction, user_id: profile.id, granted_role: role });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}