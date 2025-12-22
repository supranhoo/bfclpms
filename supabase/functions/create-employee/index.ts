import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

serve(async (req) => {
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

    // Check if user already exists with this email
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
    const existingUser = existingUsers?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase())

    let userId: string

    if (existingUser) {
      userId = existingUser.id
      
      // Update the existing profile
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
