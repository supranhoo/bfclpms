import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

// All 81 public tables — grouped by dependency tier
const TABLES_TO_BACKUP = [
  // Tier 1: Root/independent tables
  'companies', 'divisions', 'designations', 'pms_grades', 'kra_categories', 'modules',
  'system_settings', 'app_settings', 'workflow_templates', 'frequency_config',
  'review_periods', 'levels', 'report_access_config', 'incentive_program_types',
  'incentive_slab_categories',
  // Tier 2: Depend on tier 1
  'business_units', 'departments', 'menu_access_config',
  'review_period_locks', 'review_period_stages', 'review_period_auto_rules',
  'incentive_programs',
  // Tier 3: Depend on tier 2
  'sub_branches', 'business_unit_sub_units', 'employee_job_descriptions',
  'incentive_program_mappings', 'incentive_program_custom_tabs',
  'incentive_slabs', 'incentive_allocation_rules', 'incentive_disqualification_rules',
  'incentive_eligibility_fields', 'incentive_production_rates', 'incentive_vessel_rates',
  // Tier 4: Profiles (depends on departments, designations, etc.)
  'profiles', 'user_roles', 'skill_competencies',
  'menu_access_user_overrides',
  // Tier 5: Depend on profiles
  'password_rollout_logs', 'employee_working_days', 'org_kpi_data_owners',
  'audit_kpi_assignments', 'kpi_templates', 'template_bundles',
  'report_access_user_overrides',
  'production_targets', 'production_daily_entries', 'vessel_monthly_entries',
  'employee_incentive_eligibility', 'incentive_custom_tab_data',
  // Tier 6: Depend on tier 5
  'template_bundle_items', 'bundle_assignment_logs', 'template_change_logs',
  'workflow_config', 'workflow_settings',
  // Tier 7: KPIs (depend on profiles, categories, templates)
  'kpis', 'kpi_rollback_requests', 'kpi_mention_access',
  'audit_kpi_level_assignments',
  // Tier 8: Depend on KPIs
  'review_submissions', 'sub_period_submissions', 'performance_reviews',
  'kpi_queries', 'kpi_audit_logs', 'kpi_observations',
  'org_kpi_values', 'org_kpi_data_entry_logs',
  'employee_incentive_records', 'incentive_score_revisions',
  // Tier 9: Depend on tier 8
  'kpi_observation_replies', 'org_kpi_value_history',
  // Tier 10: Transient/operational
  'notifications', 'email_logs', 'email_dispatch_queue',
  'kra_rollover_logs', 'import_progress',
  'review_period_audit_log',
  // Tier 11: PIP
  'performance_improvement_plans', 'pip_milestones', 'pip_audit_logs',
  'training_needs',
  // Tier 12: Backup meta (last)
  'backup_logs',
]

// Buckets to inventory for storage manifest
const STORAGE_BUCKETS = ['review-evidence', 'avatars']

// Tables with high-volume transient data — prune rows older than 90 days
const PRUNE_TABLES: Record<string, string> = {
  notifications: 'created_at',
  email_logs: 'created_at',
  email_dispatch_queue: 'created_at',
}

const NINETY_DAYS_AGO = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()

async function fetchAllRows(
  supabase: ReturnType<typeof createClient>,
  tableName: string,
  pruneColumn?: string
): Promise<unknown[]> {
  let allRows: unknown[] = []
  let offset = 0
  const pageSize = 1000
  let hasMore = true

  while (hasMore) {
    let query = supabase.from(tableName).select('*').range(offset, offset + pageSize - 1)

    // Apply date pruning for transient tables
    if (pruneColumn) {
      query = query.gte(pruneColumn, NINETY_DAYS_AGO)
    }

    const { data, error } = await query

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

async function processTableBatch(
  supabase: ReturnType<typeof createClient>,
  tables: string[],
  folderPath: string
): Promise<Array<{ table: string; rows: number; file: string; sizeBytes: number }>> {
  const results: Array<{ table: string; rows: number; file: string; sizeBytes: number }> = []

  const promises = tables.map(async (tableName) => {
    try {
      const pruneColumn = PRUNE_TABLES[tableName]
      const rows = await fetchAllRows(supabase, tableName, pruneColumn)

      const filePath = `${folderPath}/${tableName}.json`
      const json = JSON.stringify(rows)
      const sizeBytes = new Blob([json]).size

      const { error: uploadError } = await supabase.storage
        .from('database-backups')
        .upload(filePath, json, { contentType: 'application/json', upsert: false })

      if (uploadError) {
        console.warn(`Warning: Failed to upload ${tableName}: ${uploadError.message}`)
        return null
      }

      return { table: tableName, rows: rows.length, file: filePath, sizeBytes }
    } catch (err) {
      console.warn(`Warning: Skipping table ${tableName}: ${err}`)
      return null
    }
  })

  const settled = await Promise.all(promises)
  for (const result of settled) {
    if (result) results.push(result)
  }

  return results
}

async function listBucketFiles(
  supabase: ReturnType<typeof createClient>,
  bucketName: string
): Promise<Array<{ name: string; size: number; created_at: string }>> {
  const allFiles: Array<{ name: string; size: number; created_at: string }> = []
  
  try {
    // List root-level items (files and folders)
    const { data: rootItems, error } = await supabase.storage
      .from(bucketName)
      .list('', { limit: 1000 })

    if (error || !rootItems) {
      console.warn(`Warning: Could not list bucket ${bucketName}: ${error?.message}`)
      return allFiles
    }

    for (const item of rootItems) {
      if (item.metadata && item.metadata.size !== undefined) {
        // It's a file
        allFiles.push({
          name: item.name,
          size: item.metadata.size,
          created_at: item.created_at || '',
        })
      } else {
        // It's a folder — list its contents (one level deep)
        const { data: subItems } = await supabase.storage
          .from(bucketName)
          .list(item.name, { limit: 10000 })

        if (subItems) {
          for (const sub of subItems) {
            if (sub.metadata && sub.metadata.size !== undefined) {
              allFiles.push({
                name: `${item.name}/${sub.name}`,
                size: sub.metadata.size,
                created_at: sub.created_at || '',
              })
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn(`Warning: Error listing bucket ${bucketName}: ${err}`)
  }

  return allFiles
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

    // --- Process tables in parallel batches of 8 ---
    const BATCH_SIZE = 8
    for (let i = 0; i < TABLES_TO_BACKUP.length; i += BATCH_SIZE) {
      const batch = TABLES_TO_BACKUP.slice(i, i + BATCH_SIZE)

      try {
        const results = await processTableBatch(supabase, batch, folderPath)

        for (const r of results) {
          tableManifest.push({ table: r.table, rows: r.rows, file: r.file })
          totalRows += r.rows
          totalSizeBytes += r.sizeBytes
          tablesCount++
        }
      } catch (batchErr) {
        console.error(`Batch error (tables ${i}-${i + BATCH_SIZE}):`, batchErr)
        // Update log with partial error but continue
        await supabase.from('backup_logs').update({
          error_message: `Partial batch error at index ${i}: ${batchErr}`,
        }).eq('id', logEntry.id)
      }
    }

    // --- Generate storage manifest ---
    const storageManifest: Record<string, Array<{ name: string; size: number; created_at: string }>> = {}
    let totalStorageFiles = 0

    for (const bucket of STORAGE_BUCKETS) {
      const files = await listBucketFiles(supabase, bucket)
      storageManifest[bucket] = files
      totalStorageFiles += files.length
    }

    const storageManifestPath = `${folderPath}/storage-manifest.json`
    const storageManifestJson = JSON.stringify({
      generated_at: new Date().toISOString(),
      buckets: STORAGE_BUCKETS,
      total_files: totalStorageFiles,
      files: storageManifest,
    })

    await supabase.storage
      .from('database-backups')
      .upload(storageManifestPath, storageManifestJson, { contentType: 'application/json', upsert: false })

    // --- Create table manifest file ---
    const manifest = {
      version: 3,
      format: 'chunked',
      created_at: new Date().toISOString(),
      backup_type,
      tables_count: tablesCount,
      total_rows: totalRows,
      total_storage_files: totalStorageFiles,
      pruned_tables: Object.keys(PRUNE_TABLES),
      prune_cutoff: NINETY_DAYS_AGO,
      tables: tableManifest,
      storage_manifest_file: storageManifestPath,
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
        storage_files_inventoried: totalStorageFiles,
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
