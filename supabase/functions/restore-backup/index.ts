import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

// Delete order: leaf tables first (reverse of insert order)
const DELETE_ORDER = [
  'training_needs', 'pip_audit_logs', 'pip_milestones',
  'performance_improvement_plans', 'report_access_user_overrides',
  'org_kpi_value_history', 'org_kpi_data_entry_logs', 'kra_rollover_logs',
  'org_kpi_values', 'import_progress', 'email_logs', 'notifications',
  'kpi_observation_replies', 'kpi_observations', 'kpi_audit_logs',
  'kpi_queries', 'sub_period_submissions', 'review_submissions',
  'performance_reviews', 'audit_kpi_level_assignments', 'kpi_rollback_requests',
  'kpis', 'workflow_settings', 'workflow_config', 'bundle_assignment_logs',
  'template_bundle_items', 'template_bundles', 'kpi_templates',
  'audit_kpi_assignments', 'org_kpi_data_owners', 'employee_working_days',
  'password_rollout_logs', 'user_roles', 'profiles', 'sub_branches',
  'departments', 'business_units', 'report_access_config', 'levels',
  'divisions', 'designations', 'pms_grades', 'kra_categories', 'modules',
  'system_settings', 'app_settings', 'workflow_templates', 'frequency_config',
  'review_periods', 'backup_logs',
]

// Insert order: parent tables first
const INSERT_ORDER = [
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
  'training_needs',
]

interface ManifestV2 {
  version: number
  format: string
  tables: Array<{ table: string; rows: number; file: string }>
}

async function loadChunkedBackupData(
  supabase: ReturnType<typeof createClient>,
  manifest: ManifestV2
): Promise<Record<string, unknown[]>> {
  const backupData: Record<string, unknown[]> = {}
  for (const entry of manifest.tables) {
    try {
      const { data: fileData, error } = await supabase.storage
        .from('database-backups')
        .download(entry.file)
      if (error || !fileData) {
        console.warn(`Warning: Could not download ${entry.table}: ${error?.message}`)
        continue
      }
      backupData[entry.table] = JSON.parse(await fileData.text())
    } catch (err) {
      console.warn(`Warning: Skipping table ${entry.table}: ${err}`)
    }
  }
  return backupData
}

async function loadLegacyBackupData(
  supabase: ReturnType<typeof createClient>,
  filePath: string
): Promise<Record<string, unknown[]>> {
  const { data: fileData, error } = await supabase.storage
    .from('database-backups')
    .download(filePath)
  if (error || !fileData) {
    throw new Error(`Failed to download backup: ${error?.message}`)
  }
  const content = JSON.parse(await fileData.text())
  // Legacy format: { metadata: {...}, data: {...} } or just { tableName: [...] }
  return content.data || content
}

async function restoreData(
  supabase: ReturnType<typeof createClient>,
  backupData: Record<string, unknown[]>
): Promise<{ tablesRestored: number; errors: string[] }> {
  const errors: string[] = []
  let tablesRestored = 0

  // Step 1: Delete all data in reverse dependency order
  for (const tableName of DELETE_ORDER) {
    if (backupData[tableName] !== undefined) {
      try {
        const { error } = await supabase
          .from(tableName)
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000')
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

  return { tablesRestored, errors }
}

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

    const { backup_id } = await req.json()
    if (!backup_id) {
      return new Response(JSON.stringify({ error: 'backup_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get backup log entry
    const { data: backupLog, error: logError } = await supabase
      .from('backup_logs').select('*').eq('id', backup_id).single()

    if (logError || !backupLog) {
      return new Response(JSON.stringify({ error: 'Backup not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!backupLog.file_path) {
      return new Response(JSON.stringify({ error: 'Backup file path missing' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Detect format and load data
    let backupData: Record<string, unknown[]>
    const isChunked = backupLog.file_path.endsWith('manifest.json')

    if (isChunked) {
      // Chunked format: download manifest, then each table file
      const { data: manifestFile, error: dlError } = await supabase.storage
        .from('database-backups')
        .download(backupLog.file_path)
      if (dlError || !manifestFile) {
        return new Response(JSON.stringify({ error: `Failed to download manifest: ${dlError?.message}` }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const manifest: ManifestV2 = JSON.parse(await manifestFile.text())
      backupData = await loadChunkedBackupData(supabase, manifest)
    } else {
      // Legacy single-file format
      backupData = await loadLegacyBackupData(supabase, backupLog.file_path)
    }

    if (!backupData || Object.keys(backupData).length === 0) {
      return new Response(JSON.stringify({ error: 'Invalid backup format or empty data' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { tablesRestored, errors } = await restoreData(supabase, backupData)

    // Log the restore action
    try {
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
      })
    } catch { /* Don't fail restore if audit log fails */ }

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
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
