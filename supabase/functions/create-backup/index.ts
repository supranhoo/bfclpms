import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const TABLES_TO_BACKUP = [
  'divisions', 'designations', 'pms_grades', 'kra_categories', 'modules',
  'system_settings', 'app_settings', 'workflow_templates', 'frequency_config',
  'review_periods', 'levels', 'report_access_config', 'business_units',
  'departments', 'sub_branches', 'profiles', 'user_roles',
  'password_rollout_logs', 'employee_working_days', 'org_kpi_data_owners',
  'audit_kpi_assignments', 'kpi_templates', 'template_bundles',
  'template_bundle_items', 'bundle_assignment_logs', 'workflow_config',
  'workflow_settings', 'kpis', 'kpi_rollback_requests',
  'audit_kpi_level_assignments', 'review_submissions', 'sub_period_submissions',
  'performance_reviews', 'kpi_queries', 'kpi_audit_logs', 'kpi_observations',
  'kpi_observation_replies', 'notifications', 'email_logs', 'kra_rollover_logs',
  'org_kpi_values', 'org_kpi_data_entry_logs', 'org_kpi_value_history',
  'report_access_user_overrides', 'import_progress',
  'performance_improvement_plans', 'pip_milestones', 'pip_audit_logs',
  'training_needs', 'backup_logs',
]

async function fetchAllRows(supabase: ReturnType<typeof createClient>, tableName: string): Promise<unknown[]> {
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

  return allRows
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const { backup_type = 'manual' } = await req.json().catch(() => ({}))

    // --- Auth gate ---
    if (backup_type === 'manual') {
      const authHeader = req.headers.get('Authorization')
      if (!authHeader) {
        return new Response(JSON.stringify({ error: 'Authorization required' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const token = authHeader.replace('Bearer ', '')
      const { data: { user }, error: authError } = await supabase.auth.getUser(token)
      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Invalid token' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { data: roles } = await supabase
        .from('user_roles').select('role')
        .eq('user_id', user.id).eq('role', 'admin')
      if (!roles || roles.length === 0) {
        return new Response(JSON.stringify({ error: 'Admin access required' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    } else {
      const cronSecret = Deno.env.get('CRON_SECRET')
      const cronHeader = req.headers.get('X-Cron-Secret')
      if (!cronSecret || !cronHeader || cronHeader !== cronSecret) {
        return new Response(JSON.stringify({ error: 'Unauthorized: valid CRON_SECRET required for scheduled backups' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // --- Clean up stuck backups (running > 30 min) ---
    await supabase
      .from('backup_logs')
      .update({
        status: 'failed',
        error_message: 'Timed out: backup was running for more than 30 minutes',
        completed_at: new Date().toISOString(),
      })
      .eq('status', 'running')
      .lt('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())

    // --- Create backup log entry ---
    const { data: logEntry, error: logError } = await supabase
      .from('backup_logs')
      .insert({ backup_type, status: 'running', backup_format: 'chunked' })
      .select()
      .single()

    if (logError) throw new Error(`Failed to create backup log: ${logError.message}`)

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const folderPath = `chunked/${timestamp}`

    let totalRows = 0
    let tablesCount = 0
    let totalSizeBytes = 0
    const tableManifest: Array<{ table: string; rows: number; file: string }> = []

    // --- Process each table: fetch, upload, release ---
    for (const tableName of TABLES_TO_BACKUP) {
      try {
        const rows = await fetchAllRows(supabase, tableName)

        const filePath = `${folderPath}/${tableName}.json`
        const json = JSON.stringify(rows)
        const sizeBytes = new Blob([json]).size

        const { error: uploadError } = await supabase.storage
          .from('database-backups')
          .upload(filePath, json, { contentType: 'application/json', upsert: false })

        if (uploadError) {
          console.warn(`Warning: Failed to upload ${tableName}: ${uploadError.message}`)
          continue
        }

        tableManifest.push({ table: tableName, rows: rows.length, file: filePath })
        totalRows += rows.length
        totalSizeBytes += sizeBytes
        tablesCount++
      } catch (err) {
        console.warn(`Warning: Skipping table ${tableName}: ${err}`)
      }
    }

    // --- Create manifest file ---
    const manifest = {
      version: 2,
      format: 'chunked',
      created_at: new Date().toISOString(),
      backup_type,
      tables_count: tablesCount,
      total_rows: totalRows,
      tables: tableManifest,
    }

    const manifestPath = `${folderPath}/manifest.json`
    const manifestJson = JSON.stringify(manifest)

    const { error: manifestUploadError } = await supabase.storage
      .from('database-backups')
      .upload(manifestPath, manifestJson, { contentType: 'application/json', upsert: false })

    if (manifestUploadError) {
      await supabase.from('backup_logs').update({
        status: 'failed',
        error_message: `Manifest upload failed: ${manifestUploadError.message}`,
        completed_at: new Date().toISOString(),
      }).eq('id', logEntry.id)
      throw new Error(`Failed to upload manifest: ${manifestUploadError.message}`)
    }

    // --- Update log as completed ---
    await supabase.from('backup_logs').update({
      status: 'completed',
      file_path: manifestPath,
      file_size_bytes: totalSizeBytes,
      tables_count: tablesCount,
      total_rows: totalRows,
      completed_at: new Date().toISOString(),
    }).eq('id', logEntry.id)

    return new Response(
      JSON.stringify({
        success: true,
        backup_id: logEntry.id,
        tables_count: tablesCount,
        total_rows: totalRows,
        file_size_bytes: totalSizeBytes,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Backup error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
