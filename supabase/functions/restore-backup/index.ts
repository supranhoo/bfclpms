import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Delete order: leaf tables first (reverse of insert order)
const DELETE_ORDER = [
  'training_needs',
  'pip_audit_logs',
  'pip_milestones',
  'performance_improvement_plans',
  'kra_rollover_logs',
  'org_kpi_values',
  'import_progress',
  'notifications',
  'kpi_observations',
  'kpi_audit_logs',
  'kpi_queries',
  'sub_period_submissions',
  'review_submissions',
  'performance_reviews',
  'kpis',
  'workflow_settings',
  'workflow_config',
  'bundle_assignment_logs',
  'template_bundle_items',
  'template_bundles',
  'kpi_templates',
  'org_kpi_data_owners',
  'employee_working_days',
  'user_roles',
  'profiles',
  'sub_branches',
  'departments',
  'business_units',
  'divisions',
  'designations',
  'pms_grades',
  'kra_categories',
  'modules',
  'system_settings',
  'app_settings',
  'workflow_templates',
  'frequency_config',
  'review_periods',
  'email_notification_settings',
  'email_templates',
  'backup_logs',
]

// Insert order: parent tables first
const INSERT_ORDER = [
  'divisions',
  'designations',
  'pms_grades',
  'kra_categories',
  'modules',
  'system_settings',
  'app_settings',
  'workflow_templates',
  'frequency_config',
  'review_periods',
  'email_notification_settings',
  'email_templates',
  'business_units',
  'departments',
  'sub_branches',
  'profiles',
  'user_roles',
  'employee_working_days',
  'org_kpi_data_owners',
  'kpi_templates',
  'template_bundles',
  'template_bundle_items',
  'bundle_assignment_logs',
  'workflow_config',
  'workflow_settings',
  'kpis',
  'review_submissions',
  'sub_period_submissions',
  'performance_reviews',
  'kpi_queries',
  'kpi_audit_logs',
  'kpi_observations',
  'notifications',
  'kra_rollover_logs',
  'org_kpi_values',
  'import_progress',
  'performance_improvement_plans',
  'pip_milestones',
  'pip_audit_logs',
  'training_needs',
]

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    // Verify admin role
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authorization required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')

    if (!roles || roles.length === 0) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { backup_id } = await req.json()
    if (!backup_id) {
      return new Response(JSON.stringify({ error: 'backup_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get backup log entry
    const { data: backupLog, error: logError } = await supabase
      .from('backup_logs')
      .select('*')
      .eq('id', backup_id)
      .single()

    if (logError || !backupLog) {
      return new Response(JSON.stringify({ error: 'Backup not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!backupLog.file_path) {
      return new Response(JSON.stringify({ error: 'Backup file path missing' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Download backup file
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('database-backups')
      .download(backupLog.file_path)

    if (downloadError || !fileData) {
      return new Response(JSON.stringify({ error: `Failed to download backup: ${downloadError?.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const backupContent = JSON.parse(await fileData.text())
    const backupData = backupContent.data

    if (!backupData) {
      return new Response(JSON.stringify({ error: 'Invalid backup format' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Disable triggers by using RPC to set session replication role
    // Note: service role bypasses RLS, but we still need to handle FK constraints
    const errors: string[] = []
    let tablesRestored = 0

    // Step 1: Delete all data in reverse dependency order
    for (const tableName of DELETE_ORDER) {
      if (backupData[tableName] !== undefined) {
        try {
          // Use a broad delete - delete all rows
          const { error } = await supabase
            .from(tableName)
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000') // Match all rows

          if (error) {
            errors.push(`Delete ${tableName}: ${error.message}`)
            console.warn(`Warning: Could not clear table ${tableName}: ${error.message}`)
          }
        } catch (err) {
          errors.push(`Delete ${tableName}: ${err}`)
        }
      }
    }

    // Step 2: Insert data in dependency order
    for (const tableName of INSERT_ORDER) {
      const rows = backupData[tableName]
      if (!rows || rows.length === 0) continue

      try {
        // Insert in batches of 500
        const batchSize = 500
        for (let i = 0; i < rows.length; i += batchSize) {
          const batch = rows.slice(i, i + batchSize)
          const { error } = await supabase
            .from(tableName)
            .upsert(batch, { onConflict: 'id', ignoreDuplicates: false })

          if (error) {
            errors.push(`Insert ${tableName} (batch ${Math.floor(i / batchSize) + 1}): ${error.message}`)
            console.warn(`Warning: Could not restore table ${tableName}: ${error.message}`)
          }
        }
        tablesRestored++
      } catch (err) {
        errors.push(`Insert ${tableName}: ${err}`)
      }
    }

    // Log the restore action in audit
    await supabase.from('kpi_audit_logs').insert({
      kpi_id: '00000000-0000-0000-0000-000000000000',
      action: 'database_restore',
      performed_by: user.id,
      metadata: {
        backup_id,
        backup_date: backupLog.created_at,
        tables_restored: tablesRestored,
        errors: errors.length > 0 ? errors : null,
      },
    }).catch(() => {
      // Don't fail the restore if audit log fails
    })

    return new Response(
      JSON.stringify({
        success: errors.length === 0,
        tables_restored: tablesRestored,
        errors: errors.length > 0 ? errors : null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Restore error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
