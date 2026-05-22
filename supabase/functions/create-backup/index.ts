import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

// Backup coverage is automatic. Tables are discovered dynamically from
// information_schema via the `get_backup_table_order` RPC so every new
// `public` table is backed up by default. Exclusions go in the
// `backup_denylist` table (with a documented reason) — never in code.
async function fetchBackupTableOrder(
  supabase: ReturnType<typeof createClient>
): Promise<string[]> {
  const { data, error } = await supabase.rpc('get_backup_table_order')
  if (error) throw new Error(`Failed to discover backup tables: ${error.message}`)
  if (!data || !Array.isArray(data) || data.length === 0) {
    throw new Error('get_backup_table_order returned no tables — refusing to run an empty backup')
  }
  return (data as Array<{ table_name: string; sort_rank: number }>)
    .sort((a, b) => a.sort_rank - b.sort_rank)
    .map((r) => r.table_name)
}

// Coverage shrink-guard: refuse to run a backup that covers fewer tables
// than the most recent successful run (prevents accidental drop of a
// table from coverage going unnoticed). Tolerance of 0 — any shrink aborts.
async function assertCoverageNotShrunk(
  supabase: ReturnType<typeof createClient>,
  discoveredCount: number
): Promise<void> {
  const { data } = await supabase
    .from('backup_logs')
    .select('tables_count')
    .in('status', ['completed', 'completed_with_errors'])
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const prev = (data as { tables_count: number | null } | null)?.tables_count ?? 0
  if (prev > 0 && discoveredCount < prev) {
    throw new Error(
      `Backup coverage shrink detected: discovered ${discoveredCount} tables, ` +
      `last successful backup covered ${prev}. Refusing to run. ` +
      `If a table was intentionally removed, add it to public.backup_denylist with a reason ` +
      `or update the previous backup_logs row.`
    )
  }
}

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

// ─── Integrity verification ─────────────────────────────────────────────────
// After all batches upload, confirm each expected <table>.json exists in
// storage and that its parsed row count matches the count we reported
// during the batch phase. Runs in small concurrent groups to keep peak
// memory under the worker limit.

type IntegrityIssues = {
  missing: string[]
  unreadable: Array<{ table: string; reason: string }>
  row_mismatch: Array<{ table: string; expected: number; actual: number }>
}

export type IntegrityReport = {
  status: 'ok' | 'failed'
  verified_tables: number
  verified_at: string
  missing: string[]
  unreadable: Array<{ table: string; reason: string }>
  row_mismatch: Array<{ table: string; expected: number; actual: number }>
}

async function verifyBackupIntegrity(
  supabase: ReturnType<typeof createClient>,
  folderPath: string,
  tableManifest: Array<{ table: string; rows: number; file: string }>
): Promise<IntegrityReport> {
  const issues: IntegrityIssues = { missing: [], unreadable: [], row_mismatch: [] }

  // Pre-list folder once so existence checks don't hammer the API.
  const presentSizes = new Map<string, number>()
  try {
    const { data: listed } = await supabase.storage
      .from('database-backups')
      .list(folderPath, { limit: 1000 })
    if (listed) {
      for (const item of listed) {
        const size = item.metadata?.size as number | undefined
        if (typeof size === 'number') presentSizes.set(item.name, size)
      }
    }
  } catch (err) {
    console.warn('Integrity: folder list failed, falling back to per-file checks:', err)
  }

  const CONCURRENCY = 4
  for (let i = 0; i < tableManifest.length; i += CONCURRENCY) {
    const slice = tableManifest.slice(i, i + CONCURRENCY)
    await Promise.all(
      slice.map(async (entry) => {
        const fileName = `${entry.table}.json`
        const sizeFromList = presentSizes.get(fileName)

        if (presentSizes.size > 0 && (sizeFromList === undefined || sizeFromList === 0)) {
          issues.missing.push(entry.table)
          return
        }

        try {
          const { data: blob, error } = await supabase.storage
            .from('database-backups')
            .download(entry.file)
          if (error || !blob) {
            issues.unreadable.push({ table: entry.table, reason: error?.message || 'empty blob' })
            return
          }
          const text = await blob.text()
          let parsed: unknown
          try {
            parsed = JSON.parse(text)
          } catch (e) {
            issues.unreadable.push({ table: entry.table, reason: `parse error: ${e}` })
            return
          }
          if (!Array.isArray(parsed)) {
            issues.unreadable.push({ table: entry.table, reason: 'payload is not an array' })
            return
          }
          if (parsed.length !== entry.rows) {
            issues.row_mismatch.push({ table: entry.table, expected: entry.rows, actual: parsed.length })
          }
        } catch (err) {
          issues.unreadable.push({ table: entry.table, reason: String(err) })
        }
      })
    )
  }

  const ok =
    issues.missing.length === 0 &&
    issues.unreadable.length === 0 &&
    issues.row_mismatch.length === 0

  return {
    status: ok ? 'ok' : 'failed',
    verified_tables: tableManifest.length,
    verified_at: new Date().toISOString(),
    missing: issues.missing,
    unreadable: issues.unreadable,
    row_mismatch: issues.row_mismatch,
  }
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
  const tablesToBackup = await fetchBackupTableOrder(supabase)
  await assertCoverageNotShrunk(supabase, tablesToBackup.length)
  const batches = splitIntoBatches(tablesToBackup, BATCH_SIZE)

  return new Response(
    JSON.stringify({
      mode: 'init',
      backup_id: logEntry.id,
      folder_path: folderPath,
      backup_type: backupType,
      batches,
      total_tables: tablesToBackup.length,
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
  // Run integrity verification first so the manifest can record the outcome.
  const integrity = await verifyBackupIntegrity(supabase, folderPath, tableManifest)

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
    integrity,
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

  // Update log — degrade status if integrity failed.
  const integritySummary =
    integrity.status === 'failed'
      ? `Integrity: ${integrity.missing.length} missing, ${integrity.unreadable.length} unreadable, ${integrity.row_mismatch.length} row mismatch`
      : null

  await supabase.from('backup_logs').update({
    status: integrity.status === 'ok' ? 'completed' : 'completed_with_errors',
    file_path: manifestPath,
    file_size_bytes: totalSizeBytes,
    tables_count: tablesCount,
    total_rows: totalRows,
    completed_at: new Date().toISOString(),
    error_message: integritySummary,
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
      integrity,
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
  // Must match the manual path (handleInit, line ~377). The scheduled worker
  // shares the same 256 MB Deno Deploy cap; sizes > 4 have been observed to
  // OOM on batch 14/16 with HTTP 546, silently dropping ~5 tables from the
  // backup manifest. See docs/changelog and POLICY.md §Backup.
  const BATCH_SIZE = 4
  const tablesToBackup = await fetchBackupTableOrder(supabase)
  await assertCoverageNotShrunk(supabase, tablesToBackup.length)
  const batches = splitIntoBatches(tablesToBackup, BATCH_SIZE)
  const tableManifest: Array<{ table: string; rows: number; file: string }> = []
  let totalRows = 0
  let totalSize = 0
  let tablesCount = 0
  const errors: string[] = []
  const discoveredCount = tablesToBackup.length

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

  // Post-finalize coverage check. If any batch failed OR fewer tables landed
  // in the manifest than were discovered, downgrade the status so the UI no
  // longer shows a plain "completed" pill for a partial run.
  const shrunk = tablesCount < discoveredCount
  if (errors.length > 0 || shrunk) {
    const parts: string[] = []
    if (shrunk) {
      parts.push(`Coverage shrink: ${tablesCount}/${discoveredCount} tables backed up`)
    }
    if (errors.length > 0) {
      parts.push(`${errors.length} warning(s): ${errors.slice(0, 3).join('; ')}`)
    }
    await supabase.from('backup_logs').update({
      status: 'completed_with_errors',
      error_message: parts.join(' — '),
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
