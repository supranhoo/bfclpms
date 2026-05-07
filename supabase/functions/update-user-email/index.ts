import { requireAdminUser } from "../_shared/admin-auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. Verify admin identity via shared helper
    const auth = await requireAdminUser(req);
    if (!auth.authorized) {
      return new Response(
        JSON.stringify({ error: auth.error }),
        { status: auth.status ?? 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const adminClient = auth.adminClient!;
    const adminUserId = auth.user!.id;

    // 2. Parse and validate request body
    const { userId, newEmail } = await req.json();

    if (!userId || !newEmail) {
      return new Response(
        JSON.stringify({ error: 'userId and newEmail are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail) || newEmail.length > 255) {
      return new Response(
        JSON.stringify({ error: 'Invalid email format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Probe auth.users — backfilled (non-login) employees only have a profiles row.
    //    Follows the canonical Non-Login User Provisioning pattern (POLICY §113).
    let authAction: 'created' | 'updated' = 'updated';
    const { data: existing, error: getErr } = await adminClient.auth.admin.getUserById(userId);

    if (!getErr && existing?.user) {
      const { error: updateAuthError } = await adminClient.auth.admin.updateUserById(
        userId,
        { email: newEmail, email_confirm: true }
      );
      if (updateAuthError) {
        console.error('Error updating auth email:', updateAuthError);
        const status = /already|exists|registered/i.test(updateAuthError.message || '') ? 409 : 500;
        return new Response(
          JSON.stringify({ error: updateAuthError.message || 'Failed to update email in auth' }),
          { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      // Non-login user → provision auth.users using the same id so all FKs stay intact.
      const { data: profile } = await adminClient
        .from('profiles')
        .select('full_name, employee_code')
        .eq('id', userId)
        .maybeSingle();

      const { error: createErr } = await adminClient.auth.admin.createUser({
        id: userId,
        email: newEmail,
        email_confirm: true,
        user_metadata: {
          full_name: profile?.full_name ?? null,
          employee_code: profile?.employee_code ?? null,
        },
      });
      if (createErr) {
        console.error('Error creating auth user:', createErr);
        const status = /already|exists|registered/i.test(createErr.message || '') ? 409 : 500;
        return new Response(
          JSON.stringify({ error: createErr.message || 'Failed to provision auth user' }),
          { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      authAction = 'created';
    }

    // 4. Update profiles table to keep in sync
    const { error: profileError } = await adminClient
      .from('profiles')
      .update({ email: newEmail })
      .eq('id', userId);

    if (profileError) {
      console.error('Error updating profile email:', profileError);
      return new Response(
        JSON.stringify({ success: true, auth_action: authAction, warning: 'Auth email updated but profile sync failed. Please update manually.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Admin ${adminUserId} ${authAction} email for user ${userId} to ${newEmail}`);

    return new Response(
      JSON.stringify({ success: true, auth_action: authAction, message: authAction === 'created' ? 'Login provisioned and email set' : 'Email updated successfully' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
