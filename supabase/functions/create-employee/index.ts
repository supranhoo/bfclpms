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
  level?: string;
  reporting_manager_id?: string;
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

    // Verify the caller is authenticated and is an admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
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
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const body: CreateEmployeeRequest = await req.json()
    
    if (!body.employee_code || !body.full_name) {
      return new Response(JSON.stringify({ error: 'employee_code and full_name are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const sanitizedCode = body.employee_code.toLowerCase().replace(/[^a-z0-9]/g, '')
    const email = body.email || `${sanitizedCode || 'user'}@placeholder-pms.com`

    const profilePayload = {
      employee_code: body.employee_code,
      full_name: body.full_name,
      designation: body.designation || null,
      department_id: body.department_id || null,
      pms_grade: body.pms_grade || null,
      level: body.level || null,
      reporting_manager_id: body.reporting_manager_id || null,
    }

    // Step 1: Check if employee already exists by employee_code in profiles
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, email')
      .eq('employee_code', body.employee_code)
      .maybeSingle()

    if (existingProfile) {
      await supabaseAdmin.from('profiles').update(profilePayload).eq('id', existingProfile.id)
      const { data: profile } = await supabaseAdmin.from('profiles').select('*').eq('id', existingProfile.id).single()
      return new Response(JSON.stringify({ profile, updated: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Step 2: Try to create the auth user directly. If user already exists, catch the error.
    const randomPassword = crypto.randomUUID() + 'Aa1!'
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: randomPassword,
      email_confirm: true,
      user_metadata: { full_name: body.full_name, employee_code: body.employee_code },
    })

    let userId: string

    if (createError) {
      // User already exists in auth — look them up by email
      if (createError.message?.includes('already been registered') || createError.message?.includes('already exists')) {
        // Find the existing auth user by listing with exact email match
        const { data: listData } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1, page: 1 })
        // listUsers filter is unreliable, so search all users by email manually
        // For large user bases this is slow, but we only hit this path for duplicates
        let foundUser = null
        let page = 1
        while (!foundUser) {
          const { data: pageData } = await supabaseAdmin.auth.admin.listUsers({ perPage: 100, page })
          if (!pageData?.users?.length) break
          foundUser = pageData.users.find(u => u.email?.toLowerCase() === email.toLowerCase())
          if (pageData.users.length < 100) break
          page++
        }

        if (!foundUser) {
          return new Response(JSON.stringify({ error: `User with email ${email} exists in auth but could not be found` }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
        userId = foundUser.id
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
      .upsert({ id: userId, email, ...profilePayload }, { onConflict: 'id' })

    if (upsertError) {
      console.error('Failed to upsert profile:', upsertError)
    }

    // Step 4: Fetch and return the profile
    const { data: profile, error: fetchError } = await supabaseAdmin
      .from('profiles').select('*').eq('id', userId).single()

    if (fetchError) {
      return new Response(JSON.stringify({ error: `Failed to fetch profile: ${fetchError.message}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ profile }), {
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
