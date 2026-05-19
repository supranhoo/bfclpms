import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

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
  // ───────────────────────────────────────────────────────────────
  // Safety module (T-003, Phase 1.5) — appended after PMS tiers so
  // dependency order is preserved (Safety references profiles,
  // business_units, departments which are restored above).
  // ───────────────────────────────────────────────────────────────
  // Safety Tier 1: Root/config
  'safety_module_access', 'safety_settings', 'safety_severity_sla',
  'safety_sops', 'safety_quizzes', 'safety_quiz_questions',
  'safety_emergency_contacts', 'safety_permit_type_config',
  'safety_audit_templates', 'safety_audit_template_items',
  // Safety Tier 2: Depend on Tier 1 + profiles/business_units
  'safety_user_roles', 'safety_hours_worked', 'safety_assets',
  'safety_emergency_drills', 'safety_audit_runs',
  'safety_training_assignments',
  // Safety Tier 3
  'safety_asset_calibrations', 'safety_asset_evidence',
  'safety_drill_participants', 'safety_drill_findings',
  'safety_audit_run_responses', 'safety_training_attempts',
  'safety_permits',
  // Safety Tier 4
  'safety_permit_approvals', 'safety_permit_evidence',
  'safety_permit_hira', 'safety_permit_loto_steps',
  'safety_incidents',
  // Safety Tier 5
  'safety_incident_evidence', 'safety_incident_progress_logs',
  'safety_incident_timeline', 'safety_sla_escalations',
  'safety_notifications', 'safety_audit_log',
]

// Buckets to inventory for storage manifest
const STORAGE_BUCKETS = ['review-evidence', 'avatars', 'safety-media']

// Tables with high-volume transient data — prune rows older than 90 days
const PRUNE_TABLES: Record<string, string> = {
  notifications: 'created_at',
  email_logs: 'created_at',
  email_dispatch_queue: 'created_at',
  safety_notifications: 'created_at',
}

const NINETY_DAYS_AGO = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()

// Split tables into batches of given size
function splitIntoBatches(tables: string[], batchSize: number): string[][] {
  const batches: string[][] = []
  for (let i = 0; i < tables.length; i += batchSize) {
    batches.push(tables.slice(i, i + batchSize))
  }
  return batches
}

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
): Promise<{ results: Array<{ table: string; rows: number; file: string; sizeBytes: number }>; errors: string[] }> {
  const results: Array<{ table: string; rows: number; file: string; sizeBytes: number }> = []
  const errors: string[] = []

  // Process tables sequentially within a batch to keep peak memory low.
  // Parallel Promise.all here caused WORKER_RESOURCE_LIMIT once the 33
  // safety_* tables were added — multiple large table payloads were held
  // in RAM simultaneously (rows array + JSON string + Blob copy).
  for (const tableName of tables) {
    try {
      const pruneColumn = PRUNE_TABLES[tableName]
      const rows = await fetchAllRows(supabase, tableName, pruneColumn)

      const filePath = `${folderPath}/${tableName}.json`
      const json = JSON.stringify(rows)
      // Byte length without allocating a Blob copy.
      const sizeBytes = new TextEncoder().encode(json).byteLength

      const { error: uploadError } = await supabase.storage
        .from('database-backups')
        .upload(filePath, json, { contentType: 'application/json', upsert: false })

      if (uploadError) {
        errors.push(`Failed to upload ${tableName}: ${uploadError.message}`)
      } else {
        results.push({ table: tableName, rows: rows.length, file: filePath, sizeBytes })
      }
    } catch (err) {
      errors.push(`Skipping table ${tableName}: ${err}`)
    }
  }

  return { results, errors }
}

async function listBucketFiles(
  supabase: ReturnType<typeof createClient>,
  bucketName: string
): Promise<Array<{ name: string; size: number; created_at: string }>> {
  const allFiles: Array<{ name: string; size: number; created_at: string }> = []

  try {
    const { data: rootItems, error } = await supabase.storage
      .from(bucketName)
      .list('', { limit: 1000 })

    if (error || !rootItems) {
      console.warn(`Warning: Could not list bucket ${bucketName}: ${error?.message}`)
      return allFiles
    }

    for (const item of rootItems) {
      if (item.metadata && item.metadata.size !== undefined) {
        allFiles.push({ name: item.name, size: item.metadata.size, created_at: item.created_at || '' })
      } else {
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

// ─── Auth helpers ───────────────────────────────────────────────────────────

async function authenticateRequest(
  req: Request,
  supabase: ReturnType<typeof createClient>,
  backupType: string
): Promise<Response | null> {
  if (backupType === 'manual') {
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
    return null // auth passed
  }

  // Scheduled backup — validate cron secret
  const cronSecret = Deno.env.get('CRON_SECRET')
  const cronHeader = req.headers.get('X-Cron-Secret')
  if (!cronSecret || !cronHeader || cronHeader !== cronSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized: valid CRON_SECRET required for scheduled backups' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  return null
}

// ─── Internal auth for worker calls (batch/finalize) ────────────────────────

function validateInternalSecret(req: Request): boolean {
  const internalSecret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const header = req.headers.get('X-Backup-Internal')
  return !!internalSecret && header === internalSecret
}

// ─── MODE 1: INIT ───────────────────────────────────────────────────────────

async function handleInit(
  req: Request,
  supabase: ReturnType<typeof createClient>,
  backupType: string
): Promise<Response> {
  // Auth gate
  const authResponse = await authenticateRequest(req, supabase, backupType)
  if (authResponse) return authResponse

  // Clean up stuck backups (running > 30 min)
  await supabase
    .from('backup_logs')
    .update({
      status: 'failed',
      error_message: 'Timed out: backup was running for more than 30 minutes',
      completed_at: new Date().toISOString(),
    })
    .eq('status', 'running')
    .lt('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())

  // Create backup log entry
  const { data: logEntry, error: logError } = await supabase
    .from('backup_logs')
    .insert({ backup_type: backupType, status: 'running', backup_format: 'chunked' })
    .select()
    .single()

  if (logError) throw new Error(`Failed to create backup log: ${logError.message}`)

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const folderPath = `chunked/${timestamp}`
  // Smaller batches reduce per-invocation peak memory. Each batch runs in
  // its own edge worker, so reducing batch size trades a few extra
  // invocations for staying well under the 256MB worker limit.
  const BATCH_SIZE = 4
  const batches = splitIntoBatches(TABLES_TO_BACKUP, BATCH_SIZE)

  return new Response(
    JSON.stringify({
      mode: 'init',
      backup_id: logEntry.id,
      folder_path: folderPath,
      backup_type: backupType,
      batches,
      total_tables: TABLES_TO_BACKUP.length,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

// ─── MODE 2: PROCESS BATCH ─────────────────────────────────────────────────

async function handleBatch(
  supabase: ReturnType<typeof createClient>,
  backupId: string,
  folderPath: string,
  tables: string[]
): Promise<Response> {
  const { results, errors } = await processTableBatch(supabase, tables, folderPath)

  // Accumulate partial progress on the log entry
  const totalRows = results.reduce((sum, r) => sum + r.rows, 0)
  const totalSize = results.reduce((sum, r) => sum + r.sizeBytes, 0)

  // Incrementally update backup_logs so UI reflects mid-flight progress
  try {
    const { data: existing } = await supabase
      .from('backup_logs')
      .select('tables_count, total_rows, file_size_bytes')
      .eq('id', backupId)
      .maybeSingle()

    if (existing) {
      await supabase.from('backup_logs').update({
        tables_count: (existing.tables_count || 0) + results.length,
        total_rows: (existing.total_rows || 0) + totalRows,
        file_size_bytes: (existing.file_size_bytes || 0) + totalSize,
      }).eq('id', backupId)
    }
  } catch (e) {
    console.warn('Failed to update progress on backup_logs:', e)
  }

  return new Response(
    JSON.stringify({
      mode: 'batch',
      processed: results.map(r => ({ table: r.table, rows: r.rows, sizeBytes: r.sizeBytes })),
      tables_processed: results.length,
      total_rows: totalRows,
      total_size_bytes: totalSize,
      errors,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

// ─── MODE 3: FINALIZE ──────────────────────────────────────────────────────

async function handleFinalize(
  supabase: ReturnType<typeof createClient>,
  backupId: string,
  folderPath: string,
  backupType: string,
  tablesCount: number,
  totalRows: number,
  totalSizeBytes: number,
  tableManifest: Array<{ table: string; rows: number; file: string }>
): Promise<Response> {
  // Generate storage manifest
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

  // Create table manifest file
  const manifest = {
    version: 3,
    format: 'chunked',
    created_at: new Date().toISOString(),
    backup_type: backupType,
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
    }).eq('id', backupId)
    throw new Error(`Failed to upload manifest: ${manifestUploadError.message}`)
  }

  // Update log as completed
  await supabase.from('backup_logs').update({
    status: 'completed',
    file_path: manifestPath,
    file_size_bytes: totalSizeBytes,
    tables_count: tablesCount,
    total_rows: totalRows,
    completed_at: new Date().toISOString(),
  }).eq('id', backupId)

  return new Response(
    JSON.stringify({
      mode: 'finalize',
      success: true,
      backup_id: backupId,
      tables_count: tablesCount,
      total_rows: totalRows,
      file_size_bytes: totalSizeBytes,
      storage_files_inventoried: totalStorageFiles,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

// ─── MODE: SCHEDULED (chunked dispatcher with EdgeRuntime.waitUntil) ────────
// Replaces the old self-contained handler that exceeded the 150s wall-clock
// limit. Now mirrors the proven manual-backup flow: INIT returns immediately
// after creating the log row, then background tasks invoke each batch +
// finalize as separate edge calls (each gets its own 150s budget).

declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void } | undefined

async function callSelf(payload: Record<string, unknown>): Promise<{ ok: boolean; data?: any; error?: string }> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const internalSecret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/create-backup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${internalSecret}`,
        'X-Backup-Internal': internalSecret,
      },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok, data, error: res.ok ? undefined : (data?.error || `HTTP ${res.status}`) }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

async function runScheduledChunked(
  supabase: ReturnType<typeof createClient>,
  backupId: string,
  folderPath: string
): Promise<void> {
  const startTime = Date.now()
  const BATCH_SIZE = 9
  const batches = splitIntoBatches(TABLES_TO_BACKUP, BATCH_SIZE)
  const tableManifest: Array<{ table: string; rows: number; file: string }> = []
  let totalRows = 0
  let totalSize = 0
  let tablesCount = 0
  const errors: string[] = []

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]
    const result = await callSelf({
      backup_type: 'scheduled',
      backup_id: backupId,
      folder_path: folderPath,
      tables: batch,
    })

    if (!result.ok) {
      errors.push(`Batch ${i + 1}/${batches.length} failed: ${result.error}`)
      console.error(`Scheduled backup batch ${i + 1} failed:`, result.error)
      continue
    }

    const processed = result.data?.processed || []
    for (const p of processed) {
      tableManifest.push({ table: p.table, rows: p.rows, file: `${folderPath}/${p.table}.json` })
      totalRows += p.rows
      totalSize += p.sizeBytes || 0
      tablesCount++
    }
    if (result.data?.errors?.length) errors.push(...result.data.errors)
  }

  const finalizeResult = await callSelf({
    backup_type: 'scheduled',
    backup_id: backupId,
    folder_path: folderPath,
    finalize: true,
    table_manifest: tableManifest,
    tables_count: tablesCount,
    total_rows: totalRows,
    total_size_bytes: totalSize,
  })

  if (!finalizeResult.ok) {
    await supabase.from('backup_logs').update({
      status: 'failed',
      error_message: `Finalize failed: ${finalizeResult.error}. Batch errors: ${errors.slice(0, 5).join('; ')}`,
      completed_at: new Date().toISOString(),
    }).eq('id', backupId)
    console.error('Scheduled backup finalize failed:', finalizeResult.error)
    return
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000)
  console.log(`Scheduled backup ${backupId} completed in ${elapsed}s: ${tablesCount} tables, ${totalRows} rows`)

  if (errors.length > 0) {
    await supabase.from('backup_logs').update({
      error_message: `Completed with ${errors.length} warning(s): ${errors.slice(0, 3).join('; ')}`,
    }).eq('id', backupId)
  }
}

async function handleScheduled(
  req: Request,
  supabase: ReturnType<typeof createClient>
): Promise<Response> {
  const authResponse = await authenticateRequest(req, supabase, 'scheduled')
  if (authResponse) return authResponse

  // Clean up stuck backups (running > 30 min)
  await supabase
    .from('backup_logs')
    .update({
      status: 'failed',
      error_message: 'Timed out: backup was running for more than 30 minutes',
      completed_at: new Date().toISOString(),
    })
    .eq('status', 'running')
    .lt('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())

  const { data: logEntry, error: logError } = await supabase
    .from('backup_logs')
    .insert({ backup_type: 'scheduled', status: 'running', backup_format: 'chunked' })
    .select()
    .single()

  if (logError) throw new Error(`Failed to create backup log: ${logError.message}`)

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const folderPath = `chunked/${timestamp}`

  // Fire-and-forget the chunked orchestration. Each batch + finalize is a
  // separate edge invocation with its own 150s budget — same model as manual.
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
    EdgeRuntime.waitUntil(runScheduledChunked(supabase, logEntry.id, folderPath))
  } else {
    runScheduledChunked(supabase, logEntry.id, folderPath).catch(err =>
      console.error('Scheduled backup orchestration error:', err)
    )
  }

  return new Response(
    JSON.stringify({
      success: true,
      mode: 'scheduled-dispatched',
      backup_id: logEntry.id,
      folder_path: folderPath,
      message: 'Scheduled backup dispatched as chunked workers. Track progress in backup_logs.',
    }),
    { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

// ─── MAIN HANDLER ───────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const body = await req.json().catch(() => ({}))
    const { backup_type = 'manual', backup_id, folder_path, tables, finalize, table_manifest, tables_count, total_rows, total_size_bytes } = body

    // ─── Scheduled backups: self-contained with time guard ───
    if (backup_type === 'scheduled' && !backup_id) {
      return await handleScheduled(req, supabase)
    }

    // ─── Mode 3: FINALIZE ───
    if (finalize && backup_id && folder_path) {
      // Validate internal auth for worker calls
      if (!validateInternalSecret(req)) {
        const authResponse = await authenticateRequest(req, supabase, backup_type)
        if (authResponse) return authResponse
      }
      return await handleFinalize(
        supabase,
        backup_id,
        folder_path,
        backup_type,
        tables_count || 0,
        total_rows || 0,
        total_size_bytes || 0,
        table_manifest || []
      )
    }

    // ─── Mode 2: PROCESS BATCH ───
    if (backup_id && folder_path && tables && Array.isArray(tables)) {
      // Validate internal auth for worker calls
      if (!validateInternalSecret(req)) {
        const authResponse = await authenticateRequest(req, supabase, backup_type)
        if (authResponse) return authResponse
      }
      return await handleBatch(supabase, backup_id, folder_path, tables)
    }

    // ─── Mode 1: INIT ───
    return await handleInit(req, supabase, backup_type)

  } catch (error) {
    console.error('Backup error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
