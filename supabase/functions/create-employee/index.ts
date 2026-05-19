// Edge function: create-employee (verify_jwt=false, auth validated in code)
import { createClient } from "npm:@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

interface CreateEmployeeRequest {
  employee_code: string;
  full_name: string;
  email?: string;
  designation?: string;
  department_id?: string;
  pms_grade?: string;
  level?: string;
  reporting_manager_id?: string;
  company_id?: string;
  location?: string;
  portal_access?: boolean;
  is_active?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Verify the caller is authenticated
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      console.error('No auth header found')
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log('Auth header present, validating user...')
    const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await anonClient.auth.getUser()
    
    if (authError || !user) {
      console.error('Auth validation failed:', authError?.message)
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log('User validated:', user.id)

    // Check if user is admin
    const { data: roles } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single()

    if (!roles) {
      return new Response(JSON.stringify({ error: 'Unauthorized - admin access required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const body: CreateEmployeeRequest = await req.json()
    
    if (!body.employee_code || !body.full_name) {
      return new Response(JSON.stringify({ error: 'employee_code and full_name are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Determine portal access: explicit flag or infer from email
    const portalAccess = body.portal_access !== undefined ? body.portal_access : !!body.email;

    // Soft-resolve location name → location_id (case-insensitive). Unmatched values insert NULL.
    let locationId: string | null = null;
    if (body.location && body.location.trim()) {
      const normalized = body.location.trim().toUpperCase();
      const { data: locRows } = await supabaseAdmin
        .from('locations')
        .select('id, name')
        .ilike('name', normalized);
      const match = (locRows || []).find((l: any) => String(l.name).trim().toUpperCase() === normalized);
      locationId = match?.id || null;
      if (!match) {
        console.warn(`[create-employee] Location "${body.location}" not found in master; inserting with location_id=NULL`);
      }
    }

    const profilePayload = {
      employee_code: body.employee_code,
      full_name: body.full_name,
      designation: body.designation || null,
      department_id: body.department_id || null,
      pms_grade: body.pms_grade || null,
      level: body.level || null,
      reporting_manager_id: body.reporting_manager_id || null,
      company_id: body.company_id || null,
      location_id: locationId,
      portal_access: portalAccess,
      has_real_email: !!body.email, // FALSE when no email provided -> employee-code login
      ...(typeof body.is_active === 'boolean' ? { is_active: body.is_active } : {}),
    }

    // Admin account protection — never overwrite this profile
    const ADMIN_ID = '535d9a14-e4aa-4676-af92-f535373ffc8d'

    // Step 1: Check if employee already exists by employee_code in profiles
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, email')
      .eq('employee_code', body.employee_code)
      .maybeSingle()

    if (existingProfile && existingProfile.id !== ADMIN_ID) {
      // Safe to update — this is a regular employee
      await supabaseAdmin.from('profiles').update(profilePayload).eq('id', existingProfile.id)
      const { data: profile } = await supabaseAdmin.from('profiles').select('*').eq('id', existingProfile.id).single()
      return new Response(JSON.stringify({ profile, updated: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ─── PROFILE-ONLY PATH (no portal access) ───
    if (!portalAccess) {
      const newId = crypto.randomUUID()
      const { error: insertError } = await supabaseAdmin
        .from('profiles')
        .insert({ id: newId, email: body.email || null, ...profilePayload })

      if (insertError) {
        console.error('Failed to insert profile-only user:', insertError)
        const friendly = insertError.message?.includes('not-null')
          ? 'A required field is missing. Please check the data.'
          : insertError.message?.includes('duplicate key')
            ? 'This employee already exists in the system.'
            : `Failed to create profile: ${insertError.message}`;
        return new Response(JSON.stringify({ error: friendly }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Assign default employee role
      await supabaseAdmin.from('user_roles').insert({ user_id: newId, role: 'employee' })

      const { data: profile } = await supabaseAdmin.from('profiles').select('*').eq('id', newId).single()
      return new Response(JSON.stringify({ profile }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ─── AUTH + PROFILE PATH (portal access) ───
    const sanitizedCode = body.employee_code.toLowerCase().replace(/[^a-z0-9]/g, '')
    // No email provided -> mint a SYNTHETIC, NON-ROUTABLE address. The user
    // logs in via Employee Code (resolved through lookup_synthetic_email_by_code).
    // The synthetic value lives ONLY on auth.users.email — profiles.email stays NULL.
    const SYNTHETIC_DOMAIN = 'noemail.bfclpms.local'
    const isSynthetic = !body.email
    const email = body.email || `${sanitizedCode || 'user'}@${SYNTHETIC_DOMAIN}`

    // Step 2: Try to create the auth user
    const randomPassword = crypto.randomUUID() + 'Aa1!'
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: randomPassword,
      email_confirm: true,
      user_metadata: { full_name: body.full_name, employee_code: body.employee_code },
    })

    let userId: string

    if (createError) {
      if (createError.message?.includes('already been registered') || createError.message?.includes('already exists')) {
        // First try profiles table lookup by email
        const { data: existingByEmail } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .eq('email', email)
          .neq('id', ADMIN_ID)
          .maybeSingle()

        if (existingByEmail) {
          userId = existingByEmail.id
        } else {
          // Profile not found by email — search auth users to get the ID
          let found = false
          let page = 1
          while (!found) {
            const { data: { users }, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 500 })
            if (listErr || !users || users.length === 0) break
            const match = users.find(u => u.email === email && u.id !== ADMIN_ID)
            if (match) {
              userId = match.id
              found = true
            } else if (users.length < 500) {
              break
            }
            page++
          }
          if (!found) {
            return new Response(JSON.stringify({ error: `User with email ${email} exists in auth but could not be resolved. Please check manually.` }), {
              status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
          }
        }
      } else {
        return new Response(JSON.stringify({ error: `Failed to create user: ${createError.message}` }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    } else {
      userId = newUser.user.id
    }

    // Step 3: Upsert the profile (trigger may have already created it)
    const { error: upsertError } = await supabaseAdmin
      .from('profiles')
      .upsert(
        // For synthetic accounts, profiles.email MUST be NULL (DB CHECK constraint).
        { id: userId, email: isSynthetic ? null : email, ...profilePayload },
        { onConflict: 'id' }
      )

    if (upsertError) {
      console.error('Failed to upsert profile:', upsertError)
      const friendly = upsertError.message?.includes('not-null')
        ? 'A required field is missing. Please check the data.'
        : upsertError.message?.includes('duplicate key')
          ? 'This employee already exists in the system.'
          : `Failed to create profile: ${upsertError.message}`;
      return new Response(JSON.stringify({ error: friendly }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Step 4: Fetch and return the profile
    const { data: profile, error: fetchError } = await supabaseAdmin
      .from('profiles').select('*').eq('id', userId).single()

    if (fetchError) {
      return new Response(JSON.stringify({ error: `Failed to fetch profile: ${fetchError.message}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Audit the synthetic-email creation so admins can trace it.
    if (isSynthetic) {
      try {
        await supabaseAdmin.from('email_change_audit').insert({
          user_id: userId,
          old_email: null,
          new_email: email,
          performed_by: user.id,
          source: 'create_employee',
        })
      } catch (e) {
        console.warn('email_change_audit insert failed (non-fatal):', e)
      }
    }

    return new Response(JSON.stringify({ profile, has_real_email: !isSynthetic }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
