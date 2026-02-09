import { createClient } from "npm:@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CreateEmployeeRequest {
  employee_code: string;
  full_name: string;
  email?: string;
  designation?: string;
  department_id?: string;
  pms_grade?: string;
  reporting_manager_id?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Verify the caller is authenticated and is an admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Check if user is admin
    const { data: roles } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single()

    if (!roles) {
      return new Response(JSON.stringify({ error: 'Unauthorized - admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const body: CreateEmployeeRequest = await req.json()
    
    if (!body.employee_code || !body.full_name) {
      return new Response(JSON.stringify({ error: 'employee_code and full_name are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Generate placeholder email if not provided
    const email = body.email || `${body.employee_code.toLowerCase().replace(/[^a-z0-9]/g, '')}@placeholder.local`

    // First, check if employee already exists by employee_code in profiles
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, email')
      .eq('employee_code', body.employee_code)
      .maybeSingle()

    if (existingProfile) {
      // Employee already exists - just update their profile and return
      const { error: updateError } = await supabaseAdmin
        .from('profiles')
        .update({
          full_name: body.full_name,
          designation: body.designation || null,
          department_id: body.department_id || null,
          pms_grade: body.pms_grade || null,
          reporting_manager_id: body.reporting_manager_id || null,
        })
        .eq('id', existingProfile.id)

      if (updateError) {
        console.error('Failed to update existing profile:', updateError)
      }

      // Fetch and return the updated profile
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('id', existingProfile.id)
        .single()

      return new Response(JSON.stringify({ profile, updated: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Check if user already exists in auth.users by email (don't use listUsers - it paginates)
    const { data: existingUserData } = await supabaseAdmin.auth.admin.listUsers({
      filter: `email.eq.${email}`,
      page: 1,
      perPage: 1,
    })
    const existingAuthUser = existingUserData?.users?.[0] || null

    let userId: string

    if (existingAuthUser) {
      // User exists in auth - check if they have a profile
      userId = existingAuthUser.id
      
      const { data: profileCheck } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .maybeSingle()

      if (profileCheck) {
        // Profile exists - update it
        const { error: updateError } = await supabaseAdmin
          .from('profiles')
          .update({
            employee_code: body.employee_code,
            full_name: body.full_name,
            designation: body.designation || null,
            department_id: body.department_id || null,
            pms_grade: body.pms_grade || null,
            reporting_manager_id: body.reporting_manager_id || null,
          })
          .eq('id', userId)

        if (updateError) {
          console.error('Failed to update profile:', updateError)
        }
      } else {
        // Auth user exists but no profile - create profile
        const { error: insertError } = await supabaseAdmin
          .from('profiles')
          .insert({
            id: userId,
            email: email,
            employee_code: body.employee_code,
            full_name: body.full_name,
            designation: body.designation || null,
            department_id: body.department_id || null,
            pms_grade: body.pms_grade || null,
            reporting_manager_id: body.reporting_manager_id || null,
          })

        if (insertError) {
          console.error('Failed to insert profile:', insertError)
          // Try upsert as fallback
          const { error: upsertError } = await supabaseAdmin
            .from('profiles')
            .upsert({
              id: userId,
              email: email,
              employee_code: body.employee_code,
              full_name: body.full_name,
              designation: body.designation || null,
              department_id: body.department_id || null,
              pms_grade: body.pms_grade || null,
              reporting_manager_id: body.reporting_manager_id || null,
            })
          
          if (upsertError) {
            console.error('Failed to upsert profile:', upsertError)
          }
        }
      }
    } else {
      // Create new auth user with a random password (they'll need to reset it)
      const randomPassword = crypto.randomUUID() + 'Aa1!'
      
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: randomPassword,
        email_confirm: true, // Auto-confirm since these are placeholder accounts
        user_metadata: {
          full_name: body.full_name,
          employee_code: body.employee_code,
        }
      })

      if (createError) {
        console.error('Failed to create user:', createError)
        return new Response(JSON.stringify({ error: `Failed to create user: ${createError.message}` }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      userId = newUser.user.id

      // Update the profile with additional data (profile is auto-created by trigger)
      const { error: updateError } = await supabaseAdmin
        .from('profiles')
        .update({
          employee_code: body.employee_code,
          full_name: body.full_name,
          designation: body.designation || null,
          department_id: body.department_id || null,
          pms_grade: body.pms_grade || null,
          reporting_manager_id: body.reporting_manager_id || null,
        })
        .eq('id', userId)

      if (updateError) {
        console.error('Failed to update profile:', updateError)
      }
    }

    // Fetch the created/updated profile
    const { data: profile, error: fetchError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (fetchError) {
      return new Response(JSON.stringify({ error: `Failed to fetch profile: ${fetchError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ profile }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
