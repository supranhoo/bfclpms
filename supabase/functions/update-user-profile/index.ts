import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // 1. Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Parse request body
    const body = await req.json();
    const { operation } = body;

    if (!operation) {
      return new Response(
        JSON.stringify({ error: 'operation is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── OPERATION: update_mobile ──────────────────────────────────────────────
    if (operation === 'update_mobile') {
      const { mobileNumber } = body;

      if (mobileNumber === undefined) {
        return new Response(
          JSON.stringify({ error: 'mobileNumber is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Validate format: optional +, digits/spaces/dashes/parens, 7-15 chars
      if (mobileNumber !== '' && !/^\+?[0-9\s\-()\u200B]{7,20}$/.test(mobileNumber)) {
        return new Response(
          JSON.stringify({ error: 'Invalid mobile number format' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { error: updateError } = await supabaseAdmin
        .from('profiles')
        .update({ mobile_number: mobileNumber || null })
        .eq('id', user.id);

      if (updateError) {
        console.error('Error updating mobile number:', updateError);
        return new Response(
          JSON.stringify({ error: 'Failed to update mobile number' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: 'Mobile number updated successfully' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── OPERATION: update_email ──────────────────────────────────────────────
    if (operation === 'update_email') {
      const { newEmail } = body;

      if (!newEmail) {
        return new Response(
          JSON.stringify({ error: 'newEmail is required' }),
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

      // Use admin API with email_confirm: false so the user must verify the new email
      const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(
        user.id,
        { email: newEmail, email_confirm: false }
      );

      if (updateAuthError) {
        console.error('Error updating email:', updateAuthError);
        return new Response(
          JSON.stringify({ error: updateAuthError.message || 'Failed to update email' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: 'A verification email has been sent to your new address. Your email will be updated after verification.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── OPERATION: update_password ───────────────────────────────────────────
    if (operation === 'update_password') {
      const { currentPassword, newPassword } = body;

      if (!currentPassword || !newPassword) {
        return new Response(
          JSON.stringify({ error: 'currentPassword and newPassword are required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (newPassword.length < 8) {
        return new Response(
          JSON.stringify({ error: 'New password must be at least 8 characters' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Validate strength: at least one number or special character
      if (!/[0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword)) {
        return new Response(
          JSON.stringify({ error: 'New password must contain at least one number or special character' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Re-authenticate with current password to verify it
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { auth: { autoRefreshToken: false, persistSession: false } }
      );

      const { error: signInError } = await supabaseClient.auth.signInWithPassword({
        email: user.email!,
        password: currentPassword,
      });

      if (signInError) {
        return new Response(
          JSON.stringify({ error: 'Current password is incorrect' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Update password via admin API
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        user.id,
        { password: newPassword }
      );

      if (updateError) {
        console.error('Error updating password:', updateError);
        return new Response(
          JSON.stringify({ error: 'Failed to update password' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: 'Password updated successfully' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: `Unknown operation: ${operation}` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
