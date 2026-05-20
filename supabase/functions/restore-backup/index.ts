import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

// Legacy hardcoded orders retained ONLY as a fallback if the
// `get_backup_table_order` RPC is unavailable. The runtime path uses the
// dynamic discovery helpers below so every table in `public` (minus the
// denylist) is restored in correct FK order automatically.
const LEGACY_DELETE_ORDER = [
  // Safety Tier 5 (leaves) — delete first
  'safety_audit_log', 'safety_notifications', 'safety_sla_escalations',
  'safety_incident_timeline', 'safety_incident_progress_logs',
  'safety_incident_evidence',
  // Safety Tier 4
  'safety_incidents',
  'safety_permit_loto_steps', 'safety_permit_hira',
  'safety_permit_evidence', 'safety_permit_approvals',
  // Safety Tier 3
  'safety_permits',
  'safety_training_attempts', 'safety_audit_run_responses',
  'safety_drill_findings', 'safety_drill_participants',
  'safety_asset_evidence', 'safety_asset_calibrations',
  // Safety Tier 2
  'safety_training_assignments', 'safety_audit_runs',
  'safety_emergency_drills', 'safety_assets',
  'safety_hours_worked', 'safety_user_roles',
  // Safety Tier 1
  'safety_audit_template_items', 'safety_audit_templates',
  'safety_permit_type_config', 'safety_emergency_contacts',
  'safety_quiz_questions', 'safety_quizzes', 'safety_sops',
  'safety_severity_sla', 'safety_settings', 'safety_module_access',
  // Tier 12: Backup meta
  'backup_logs',
  // Tier 11: PIP + Training
  'training_needs', 'pip_audit_logs', 'pip_milestones', 'performance_improvement_plans',
  // Tier 10: Transient/operational
  'review_period_audit_log', 'import_progress', 'kra_rollover_logs',
  'email_dispatch_queue', 'email_logs', 'notifications',
  // Tier 9
  'org_kpi_value_history', 'kpi_observation_replies',
  // Tier 8
  'incentive_score_revisions', 'employee_incentive_records',
  'org_kpi_data_entry_logs', 'org_kpi_values',
  'kpi_observations', 'kpi_audit_logs', 'kpi_queries',
  'performance_reviews', 'sub_period_submissions', 'review_submissions',
  // Tier 7
  'audit_kpi_level_assignments', 'kpi_mention_access',
  'kpi_rollback_requests', 'kpis',
  // Tier 6
  'workflow_settings', 'workflow_config',
  'template_change_logs', 'bundle_assignment_logs', 'template_bundle_items',
  // Tier 5
  'incentive_custom_tab_data', 'employee_incentive_eligibility',
  'vessel_monthly_entries', 'production_daily_entries', 'production_targets',
  'report_access_user_overrides',
  'template_bundles', 'kpi_templates',
  'audit_kpi_assignments', 'org_kpi_data_owners',
  'employee_working_days', 'password_rollout_logs',
  // Tier 4
  'menu_access_user_overrides', 'skill_competencies',
  'user_roles', 'profiles',
  // Tier 3
  'incentive_vessel_rates', 'incentive_production_rates',
  'incentive_eligibility_fields', 'incentive_disqualification_rules',
  'incentive_allocation_rules', 'incentive_slabs',
  'incentive_program_custom_tabs', 'incentive_program_mappings',
  'employee_job_descriptions', 'business_unit_sub_units', 'sub_branches',
  // Tier 2
  'incentive_programs', 'review_period_auto_rules', 'review_period_stages',
  'review_period_locks', 'menu_access_config',
  'departments', 'business_units',
  // Tier 1
  'incentive_slab_categories', 'incentive_program_types',
  'report_access_config', 'levels', 'review_periods',
  'frequency_config', 'workflow_templates', 'app_settings', 'system_settings',
  'modules', 'kra_categories', 'pms_grades', 'designations', 'divisions',
  'companies',
]

const LEGACY_INSERT_ORDER = [
  // Tier 1
  'companies', 'divisions', 'designations', 'pms_grades', 'kra_categories', 'modules',
  'system_settings', 'app_settings', 'workflow_templates', 'frequency_config',
  'review_periods', 'levels', 'report_access_config',
  'incentive_program_types', 'incentive_slab_categories',
  // Tier 2
  'business_units', 'departments', 'menu_access_config',
  'review_period_locks', 'review_period_stages', 'review_period_auto_rules',
  'incentive_programs',
  // Tier 3
  'sub_branches', 'business_unit_sub_units', 'employee_job_descriptions',
  'incentive_program_mappings', 'incentive_program_custom_tabs',
  'incentive_slabs', 'incentive_allocation_rules', 'incentive_disqualification_rules',
  'incentive_eligibility_fields', 'incentive_production_rates', 'incentive_vessel_rates',
  // Tier 4
  'profiles', 'user_roles', 'skill_competencies', 'menu_access_user_overrides',
  // Tier 5
  'password_rollout_logs', 'employee_working_days', 'org_kpi_data_owners',
  'audit_kpi_assignments', 'kpi_templates', 'template_bundles',
  'report_access_user_overrides',
  'production_targets', 'production_daily_entries', 'vessel_monthly_entries',
  'employee_incentive_eligibility', 'incentive_custom_tab_data',
  // Tier 6
  'template_bundle_items', 'bundle_assignment_logs', 'template_change_logs',
  'workflow_config', 'workflow_settings',
  // Tier 7
  'kpis', 'kpi_rollback_requests', 'kpi_mention_access',
  'audit_kpi_level_assignments',
  // Tier 8
  'review_submissions', 'sub_period_submissions', 'performance_reviews',
  'kpi_queries', 'kpi_audit_logs', 'kpi_observations',
  'org_kpi_values', 'org_kpi_data_entry_logs',
  'employee_incentive_records', 'incentive_score_revisions',
  // Tier 9
  'kpi_observation_replies', 'org_kpi_value_history',
  // Tier 10
  'notifications', 'email_logs', 'email_dispatch_queue',
  'kra_rollover_logs', 'import_progress', 'review_period_audit_log',
  // Tier 11
  'performance_improvement_plans', 'pip_milestones', 'pip_audit_logs',
  'training_needs',
  // Tier 12 (backup_logs deliberately excluded from restore insert — would be self-referential)
  // ───────────────────────────────────────────────────────────────
  // Safety module (T-003) — mirrors create-backup tiers; appended
  // after PMS so profiles/business_units are restored first.
  // ───────────────────────────────────────────────────────────────
  // Safety Tier 1
  'safety_module_access', 'safety_settings', 'safety_severity_sla',
  'safety_sops', 'safety_quizzes', 'safety_quiz_questions',
  'safety_emergency_contacts', 'safety_permit_type_config',
  'safety_audit_templates', 'safety_audit_template_items',
  // Safety Tier 2
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

interface ManifestV2 {
  version: number
  format: string
  tables: Array<{ table: string; rows: number; file: string }>
  storage_manifest_file?: string
}

// Fetch authoritative insert order from the DB (parents → children).
// Falls back to LEGACY_INSERT_ORDER if the RPC is unavailable. Manifest
// tables not represented in the DB order (e.g. dropped/renamed) are
// appended at the end so restore still attempts them.
async function fetchInsertOrder(
  supabase: ReturnType<typeof createClient>,
  manifestTables: string[]
): Promise<string[]> {
  let dbOrder: string[] = []
  try {
    const { data, error } = await supabase.rpc('get_backup_table_order')
    if (!error && Array.isArray(data) && data.length > 0) {
      dbOrder = (data as Array<{ table_name: string; sort_rank: number }>)
        .sort((a, b) => a.sort_rank - b.sort_rank)
        .map((r) => r.table_name)
    }
  } catch (e) {
    console.warn('get_backup_table_order RPC unavailable, falling back to legacy order:', e)
  }
  const order = dbOrder.length > 0 ? dbOrder : LEGACY_INSERT_ORDER
  const known = new Set(order)
  const extras = manifestTables.filter((t) => !known.has(t))
  return [...order, ...extras]
}

function deriveDeleteOrder(insertOrder: string[]): string[] {
  return [...insertOrder].reverse()
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
  return content.data || content
}

/**
 * Pack ordered table list into small batches, respecting both a row cap and
 * a table cap, so each edge-function invocation stays well within the
 * 150s/256MB worker limits.
 */
function packBatches(
  order: string[],
  manifestByTable: Record<string, { rows: number; file: string }>,
  opts: { maxTables: number; maxRows: number }
): string[][] {
  const batches: string[][] = []
  let cur: string[] = []
  let curRows = 0
  for (const t of order) {
    const entry = manifestByTable[t]
    if (!entry) continue
    if (cur.length >= opts.maxTables || (cur.length > 0 && curRows + entry.rows > opts.maxRows)) {
      batches.push(cur); cur = []; curRows = 0
    }
    cur.push(t)
    curRows += entry.rows
  }
  if (cur.length) batches.push(cur)
  return batches
}

async function deleteTables(
  supabase: ReturnType<typeof createClient>,
  tables: string[]
): Promise<string[]> {
  const errors: string[] = []
  for (const tableName of tables) {
    try {
      const { error } = await supabase
        .from(tableName)
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000')
      if (error) errors.push(`Delete ${tableName}: ${error.message}`)
    } catch (err) {
      errors.push(`Delete ${tableName}: ${err}`)
    }
  }
  return errors
}

async function insertTablesFromStorage(
  supabase: ReturnType<typeof createClient>,
  manifest: ManifestV2,
  tables: string[]
): Promise<{ errors: string[]; tablesProcessed: number }> {
  const errors: string[] = []
  let tablesProcessed = 0
  const byTable: Record<string, { rows: number; file: string }> = {}
  for (const e of manifest.tables) byTable[e.table] = { rows: e.rows, file: e.file }

  for (const tableName of tables) {
    const entry = byTable[tableName]
    if (!entry || entry.rows === 0) { tablesProcessed++; continue }
    try {
      const { data: fileData, error: dlErr } = await supabase.storage
        .from('database-backups')
        .download(entry.file)
      if (dlErr || !fileData) {
        errors.push(`Download ${tableName}: ${dlErr?.message ?? 'no file'}`)
        continue
      }
      const rows = JSON.parse(await fileData.text()) as unknown[]
      // Memory hardening (Phase 1.5 drill follow-up): keep the in-flight
      // upsert batch small so a 50k-row table file doesn't compound the
      // already-loaded JSON array in heap. Worker cap is 256 MB.
      const batchSize = 250
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize)
        const { error } = await supabase
          .from(tableName)
          .upsert(batch, { onConflict: 'id', ignoreDuplicates: false })
        if (error) errors.push(`Insert ${tableName} (batch ${Math.floor(i / batchSize) + 1}): ${error.message}`)
      }
      tablesProcessed++
      // Help V8 reclaim the parsed array before moving to the next table.
      rows.length = 0
    } catch (err) {
      errors.push(`Insert ${tableName}: ${err}`)
    }
  }
  return { errors, tablesProcessed }
}

async function restoreData(
  supabase: ReturnType<typeof createClient>,
  backupData: Record<string, unknown[]>
): Promise<{ tablesRestored: number; errors: string[] }> {
  const errors: string[] = []
  let tablesRestored = 0

  const manifestTables = Object.keys(backupData)
  const insertOrder = await fetchInsertOrder(supabase, manifestTables)
  const deleteOrder = deriveDeleteOrder(insertOrder)

  // Step 1: Delete all data in reverse dependency order
  for (const tableName of deleteOrder) {
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
  for (const tableName of insertOrder) {
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

async function validateStorageManifest(
  supabase: ReturnType<typeof createClient>,
  manifest: ManifestV2
): Promise<string[]> {
  const warnings: string[] = []

  if (!manifest.storage_manifest_file) return warnings

  try {
    const { data: manifestFile, error } = await supabase.storage
      .from('database-backups')
      .download(manifest.storage_manifest_file)

    if (error || !manifestFile) {
      warnings.push(`Could not download storage manifest: ${error?.message}`)
      return warnings
    }

    const storageData = JSON.parse(await manifestFile.text())
    const backupFileSet = new Set<string>()

    // Build set of all files that existed at backup time
    if (storageData.files) {
      for (const bucket of Object.keys(storageData.files)) {
        for (const file of storageData.files[bucket]) {
          backupFileSet.add(`${bucket}/${file.name}`)
        }
      }
    }

    // Check current files in review-evidence bucket
    const { data: currentFiles } = await supabase.storage
      .from('review-evidence')
      .list('', { limit: 1 })

    if (currentFiles && currentFiles.length > 0) {
      warnings.push(`Storage validation: ${backupFileSet.size} files were inventoried at backup time. Current storage appears intact.`)
    } else if (backupFileSet.size > 0) {
      warnings.push(`WARNING: ${backupFileSet.size} files were inventoried at backup time but review-evidence bucket appears empty now. Files may need manual recovery.`)
    }
  } catch (err) {
    warnings.push(`Storage manifest validation error: ${err}`)
  }

  return warnings
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

    const body = await req.json()
    const { backup_id, phase, tables, tables_restored, errors: clientErrors } = body as {
      backup_id?: string
      phase?: 'delete' | 'insert' | 'finalize'
      tables?: string[]
      tables_restored?: number
      errors?: string[]
    }
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

    const isChunked = backupLog.file_path.endsWith('manifest.json')

    // ---------- Legacy / uploaded single-file backups (small) ----------
    if (!isChunked) {
      const backupData = await loadLegacyBackupData(supabase, backupLog.file_path)
      if (!backupData || Object.keys(backupData).length === 0) {
        return new Response(JSON.stringify({ error: 'Invalid backup format or empty data' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { tablesRestored, errors } = await restoreData(supabase, backupData)
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
      } catch { /* ignore */ }
      return new Response(
        JSON.stringify({
          mode: 'legacy',
          success: errors.length === 0,
          tables_restored: tablesRestored,
          errors: errors.length > 0 ? errors : null,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ---------- Chunked backups — phased orchestration ----------
    const { data: manifestFile, error: dlError } = await supabase.storage
      .from('database-backups')
      .download(backupLog.file_path)
    if (dlError || !manifestFile) {
      return new Response(JSON.stringify({ error: `Failed to download manifest: ${dlError?.message}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const manifest = JSON.parse(await manifestFile.text()) as ManifestV2
    const byTable: Record<string, { rows: number; file: string }> = {}
    for (const e of manifest.tables) byTable[e.table] = { rows: e.rows, file: e.file }

    // Phase: INIT — return ordered batches for the client to orchestrate
    if (!phase) {
      const deleteBatches = packBatches(DELETE_ORDER, byTable, { maxTables: 20, maxRows: Number.POSITIVE_INFINITY })
      // Tighter insert batches — 2 tables / 2k rows max keeps peak heap
      // well under the 256 MB worker limit even for large PMS tables.
      const insertBatches = packBatches(INSERT_ORDER, byTable, { maxTables: 2, maxRows: 2000 })
      const totalTables = manifest.tables.length
      return new Response(
        JSON.stringify({
          mode: 'chunked',
          backup_id,
          delete_batches: deleteBatches,
          insert_batches: insertBatches,
          total_tables: totalTables,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Phase: DELETE
    if (phase === 'delete') {
      if (!Array.isArray(tables) || tables.length === 0) {
        return new Response(JSON.stringify({ error: 'tables[] required for delete phase' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const errs = await deleteTables(supabase, tables)
      return new Response(JSON.stringify({ phase: 'delete', tables, errors: errs }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Phase: INSERT
    if (phase === 'insert') {
      if (!Array.isArray(tables) || tables.length === 0) {
        return new Response(JSON.stringify({ error: 'tables[] required for insert phase' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { errors: errs, tablesProcessed } = await insertTablesFromStorage(supabase, manifest, tables)
      return new Response(
        JSON.stringify({ phase: 'insert', tables_processed: tablesProcessed, errors: errs }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Phase: FINALIZE
    if (phase === 'finalize') {
      const storageWarnings = await validateStorageManifest(supabase, manifest)
      try {
        await supabase.from('kpi_audit_logs').insert({
          kpi_id: '00000000-0000-0000-0000-000000000000',
          action: 'database_restore',
          performed_by: user.id,
          metadata: {
            backup_id,
            backup_date: backupLog.created_at,
            tables_restored: tables_restored ?? null,
            errors: clientErrors && clientErrors.length > 0 ? clientErrors : null,
            storage_warnings: storageWarnings.length > 0 ? storageWarnings : null,
          },
        })
      } catch { /* ignore */ }
      return new Response(
        JSON.stringify({
          mode: 'chunked',
          success: !clientErrors || clientErrors.length === 0,
          tables_restored: tables_restored ?? 0,
          errors: clientErrors && clientErrors.length > 0 ? clientErrors : null,
          storage_warnings: storageWarnings.length > 0 ? storageWarnings : null,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(JSON.stringify({ error: `Unknown phase: ${phase}` }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Restore error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
