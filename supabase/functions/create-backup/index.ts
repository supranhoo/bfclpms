import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TABLES_TO_BACKUP = [
  // Parent tables first (no foreign key dependencies)
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
  // Tables depending on divisions
  'business_units',
  // Tables depending on business_units
  'departments',
  // Tables depending on departments
  'sub_branches',
  // Profiles depends on departments
  'profiles',
  // Tables depending on profiles
  'user_roles',
  'employee_working_days',
  'org_kpi_data_owners',
  'kpi_templates',
  // Template bundles
  'template_bundles',
  'template_bundle_items',
  'bundle_assignment_logs',
  // Workflow config
  'workflow_config',
  'workflow_settings',
  // KPIs depend on profiles + categories
  'kpis',
  // Review data depends on KPIs
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
  // PIP tables
  'performance_improvement_plans',
  'pip_milestones',
  'pip_audit_logs',
  // Training
  'training_needs',
  // Backup logs themselves (for reference)
  'backup_logs',
]

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, serviceRoleKey)

    // Parse request body
    const { backup_type = 'manual' } = await req.json().catch(() => ({}))

    // For manual backups, verify admin role
    if (backup_type === 'manual') {
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

      // Check admin role
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
    }

    // Create backup log entry
    const { data: logEntry, error: logError } = await supabase
      .from('backup_logs')
      .insert({
        backup_type,
        status: 'running',
      })
      .select()
      .single()

    if (logError) {
      throw new Error(`Failed to create backup log: ${logError.message}`)
    }

    // Collect all table data
    const backupData: Record<string, unknown[]> = {}
    let totalRows = 0
    let tablesCount = 0

    for (const tableName of TABLES_TO_BACKUP) {
      try {
        // Fetch all rows (handle pagination for large tables)
        let allRows: unknown[] = []
        let offset = 0
        const pageSize = 1000
        let hasMore = true

        while (hasMore) {
          const { data, error } = await supabase
            .from(tableName)
            .select('*')
            .range(offset, offset + pageSize - 1)

          if (error) {
            console.warn(`Warning: Could not backup table ${tableName}: ${error.message}`)
            break
          }

          if (data && data.length > 0) {
            allRows = allRows.concat(data)
            offset += pageSize
            hasMore = data.length === pageSize
          } else {
            hasMore = false
          }
        }

        backupData[tableName] = allRows
        totalRows += allRows.length
        tablesCount++
      } catch (err) {
        console.warn(`Warning: Skipping table ${tableName}: ${err}`)
      }
    }

    // Create JSON blob
    const backupJson = JSON.stringify({
      metadata: {
        created_at: new Date().toISOString(),
        backup_type,
        tables_count: tablesCount,
        total_rows: totalRows,
      },
      data: backupData,
    })

    const fileSizeBytes = new Blob([backupJson]).size
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filePath = `backup-${timestamp}.json`

    // Upload to storage
    const { error: uploadError } = await supabase.storage
      .from('database-backups')
      .upload(filePath, backupJson, {
        contentType: 'application/json',
        upsert: false,
      })

    if (uploadError) {
      // Update log as failed
      await supabase
        .from('backup_logs')
        .update({
          status: 'failed',
          error_message: `Upload failed: ${uploadError.message}`,
          completed_at: new Date().toISOString(),
        })
        .eq('id', logEntry.id)

      throw new Error(`Failed to upload backup: ${uploadError.message}`)
    }

    // Update log as completed
    await supabase
      .from('backup_logs')
      .update({
        status: 'completed',
        file_path: filePath,
        file_size_bytes: fileSizeBytes,
        tables_count: tablesCount,
        total_rows: totalRows,
        completed_at: new Date().toISOString(),
      })
      .eq('id', logEntry.id)

    return new Response(
      JSON.stringify({
        success: true,
        backup_id: logEntry.id,
        tables_count: tablesCount,
        total_rows: totalRows,
        file_size_bytes: fileSizeBytes,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Backup error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
