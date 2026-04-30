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

      // Block synthetic / placeholder addresses — these are reserved for
      // employee-code login and must NEVER be set as a real contact email.
      const lowered = newEmail.toLowerCase();
      if (
        lowered.endsWith('@noemail.bfclpms.local') ||
        lowered.includes('@noemail.') ||
        lowered.endsWith('@placeholder-pms.com')
      ) {
        return new Response(
          JSON.stringify({ error: 'This email domain is reserved and cannot be used.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Uniqueness pre-check across auth.users (defense in depth — Supabase
      // also enforces this, but we want a friendly error before the Admin call).
      try {
        const { data: existingProfile } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .ilike('email', newEmail)
          .neq('id', user.id)
          .maybeSingle();
        if (existingProfile) {
          return new Response(
            JSON.stringify({ error: 'This email is already in use by another account.' }),
            { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } catch (_) { /* non-fatal */ }

      // Fetch from profiles table — always authoritative, JWT token may be stale
      // (e.g. if a previous Admin API email change was made, the JWT still holds the old claim)
      const { data: currentProfile } = await supabaseAdmin
        .from('profiles')
        .select('email, has_real_email')
        .eq('id', user.id)
        .single();
      const oldEmail = currentProfile?.email ?? user.email ?? '';
      const wasSynthetic =
        currentProfile?.has_real_email === false ||
        (user.email || '').toLowerCase().endsWith('@noemail.bfclpms.local') ||
        (user.email || '').toLowerCase().endsWith('@placeholder-pms.com');

      // Guard: prevent no-op updates where old and new email are the same
      if (oldEmail.toLowerCase() === newEmail.toLowerCase()) {
        return new Response(
          JSON.stringify({ error: 'This is already your current email address.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Use Admin API to update email instantly without triggering GoTrue's
      // own email delivery (which would send from no-reply@auth.lovable.cloud).
      // email_confirm: true means no confirmation link is needed — change is immediate.
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        user.id,
        { email: newEmail, email_confirm: true }
      );

      if (updateError) {
        console.error('Error updating email via Admin API:', updateError);
        return new Response(
          JSON.stringify({ error: updateError.message || 'Failed to update email' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Also sync the profiles table — and flip has_real_email = true since
      // the user now has a deliverable address.
      await supabaseAdmin
        .from('profiles')
        .update({ email: newEmail, has_real_email: true })
        .eq('id', user.id);

      // Append-only audit row (POLICY §114).
      try {
        await supabaseAdmin.from('email_change_audit').insert({
          user_id: user.id,
          old_email: wasSynthetic ? null : oldEmail,
          new_email: newEmail,
          performed_by: user.id,
          source: 'self_service',
        });
      } catch (auditErr) {
        console.error('email_change_audit insert failed (non-fatal):', auditErr);
      }

      console.log(`Email updated for user ${user.id}: ${wasSynthetic ? '(no email)' : oldEmail} → ${newEmail}`);

      // Send branded notification email from the org's configured sender
      // (hrms@bfclalloys.com via Microsoft Graph) to the NEW email address.
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

        // Get recipient name from profiles
        const { data: profileData } = await supabaseAdmin
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .single();

        const recipientName = profileData?.full_name || newEmail;

        await fetch(`${supabaseUrl}/functions/v1/send-email-notification`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${anonKey}`,
            'apikey': anonKey,
          },
          body: JSON.stringify({
            event_type: 'email_changed',
            recipient_email: newEmail,
            recipient_name: recipientName,
            old_email: oldEmail,
            new_email: newEmail,
          }),
        });
      } catch (notifyErr) {
        // Non-fatal — the email change itself succeeded
        console.error('Failed to send email_changed notification:', notifyErr);
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: wasSynthetic
            ? 'Your email has been added. You can now receive notifications and reset your password by email.'
            : 'Your email address has been updated successfully.',
          was_synthetic: wasSynthetic,
        }),
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
