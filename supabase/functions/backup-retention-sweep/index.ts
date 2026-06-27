import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// CORS — kept inline (Lovable edge functions do not share modules).
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

interface RetentionPolicy {
  enabled: boolean
  keep_completed_days: number
  keep_completed_min_count: number
  keep_partial_days: number
  keep_failed_days: number
  dry_run: boolean
}

const DEFAULT_POLICY: RetentionPolicy = {
  enabled: false,
  keep_completed_days: 30,
  keep_completed_min_count: 10,
  keep_partial_days: 14,
  keep_failed_days: 7,
  dry_run: false,
}

interface BackupRow {
  id: string
  status: string
  backup_type: string | null
  created_at: string
  file_path: string | null
  file_size_bytes: number | null
}

interface Candidate extends BackupRow {
  reason: 'age_completed' | 'age_partial' | 'age_failed'
}

function selectCandidates(rows: BackupRow[], policy: RetentionPolicy, now: Date): Candidate[] {
  if (!policy.enabled) return []
  const nowMs = now.getTime()
  const dayMs = 86_400_000
  const completedCutoff = nowMs - policy.keep_completed_days * dayMs
  const partialCutoff = nowMs - policy.keep_partial_days * dayMs
  const failedCutoff = nowMs - policy.keep_failed_days * dayMs

  const completed = rows
    .filter((r) => r.status === 'completed' && r.backup_type !== 'retention_sweep')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const out: Candidate[] = []
  for (let i = 0; i < completed.length; i++) {
    if (i < policy.keep_completed_min_count) continue
    const r = completed[i]
    if (new Date(r.created_at).getTime() < completedCutoff) {
      out.push({ ...r, reason: 'age_completed' })
    }
  }
  for (const r of rows) {
    if (r.backup_type === 'retention_sweep') continue
    if (r.status === 'completed_with_errors' && new Date(r.created_at).getTime() < partialCutoff) {
      out.push({ ...r, reason: 'age_partial' })
    } else if (r.status === 'failed' && new Date(r.created_at).getTime() < failedCutoff) {
      out.push({ ...r, reason: 'age_failed' })
    }
  }
  return out
}

function folderForBackup(filePath: string | null): string | null {
  if (!filePath) return null
  const idx = filePath.lastIndexOf('/')
  return idx === -1 ? null : filePath.slice(0, idx)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const cronSecret = Deno.env.get('CRON_SECRET')

    // Auth: cron secret OR service-role bearer OR admin JWT (for "Run Now").
    const providedCron = req.headers.get('x-cron-secret')
    const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
    const cronOk = !!cronSecret && providedCron === cronSecret
    const srvOk = !!serviceRoleKey && bearer === serviceRoleKey

    let adminOk = false
    if (!cronOk && !srvOk && bearer) {
      const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
      })
      const { data: userData } = await userClient.auth.getUser(bearer)
      if (userData?.user) {
        const admin = createClient(supabaseUrl, serviceRoleKey)
        const { data: roleRow } = await admin
          .from('user_roles')
          .select('role')
          .eq('user_id', userData.user.id)
          .eq('role', 'admin')
          .maybeSingle()
        adminOk = !!roleRow
      }
    }

    if (!cronOk && !srvOk && !adminOk) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)

    // Allow request-level overrides (admin "Run Now (preview)" forces dry_run=true).
    let overrideDryRun: boolean | undefined
    let allowDisabledForPreview = false
    if (req.method === 'POST') {
      try {
        const body = await req.json()
        if (typeof body?.dry_run === 'boolean') overrideDryRun = body.dry_run
        if (body?.preview === true) {
          overrideDryRun = true
          allowDisabledForPreview = true
        }
      } catch {
        /* no body — fine */
      }
    }

    // Load policy from system_settings.
    const { data: settingRow } = await supabase
      .from('system_settings')
      .select('setting_value')
      .eq('setting_key', 'backup_retention_policy')
      .maybeSingle()

    let policy: RetentionPolicy = DEFAULT_POLICY
    if (settingRow?.setting_value) {
      try {
        const parsed = JSON.parse(settingRow.setting_value as string)
        policy = { ...DEFAULT_POLICY, ...parsed }
      } catch {
        /* fall back to default */
      }
    }
    if (overrideDryRun !== undefined) policy = { ...policy, dry_run: overrideDryRun }
    // Preview bypasses the disabled gate so admins can see "what would happen".
    const effectivePolicy = allowDisabledForPreview ? { ...policy, enabled: true } : policy

    if (!effectivePolicy.enabled) {
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: 'policy_disabled' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Load every backup_logs row needed for candidate selection. ~hundreds
    // of rows expected — well below the PostgREST default page size.
    const { data: rows, error: rowsErr } = await supabase
      .from('backup_logs')
      .select('id, status, backup_type, created_at, file_path, file_size_bytes')
      .order('created_at', { ascending: false })
      .limit(5000)
    if (rowsErr) throw new Error(`backup_logs lookup failed: ${rowsErr.message}`)

    const candidates = selectCandidates(rows ?? [], effectivePolicy, new Date())

    let deletedRows = 0
    let deletedFiles = 0
    let freedBytes = 0
    const errors: string[] = []

    if (!policy.dry_run && !allowDisabledForPreview) {
      for (const c of candidates) {
        try {
          const folder = folderForBackup(c.file_path)
          if (folder) {
            // Paginate storage list (>1000 files per folder is theoretical
            // but defensively handled).
            let offset = 0
            const pageSize = 1000
            for (;;) {
              const { data: files, error: listErr } = await supabase.storage
                .from('database-backups')
                .list(folder, { limit: pageSize, offset })
              if (listErr) {
                errors.push(`list(${folder}): ${listErr.message}`)
                break
              }
              if (!files || files.length === 0) break
              const paths = files.map((f) => `${folder}/${f.name}`)
              // Remove in chunks of 100 to stay well under storage limits.
              for (let i = 0; i < paths.length; i += 100) {
                const chunk = paths.slice(i, i + 100)
                const { error: rmErr } = await supabase.storage
                  .from('database-backups')
                  .remove(chunk)
                if (rmErr) {
                  errors.push(`remove(${folder}): ${rmErr.message}`)
                } else {
                  deletedFiles += chunk.length
                }
              }
              if (files.length < pageSize) break
              offset += pageSize
            }
          }

          const { error: delErr } = await supabase
            .from('backup_logs')
            .delete()
            .eq('id', c.id)
          if (delErr) {
            errors.push(`delete row ${c.id}: ${delErr.message}`)
          } else {
            deletedRows += 1
            freedBytes += c.file_size_bytes ?? 0
          }
        } catch (e) {
          errors.push(`candidate ${c.id}: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
    }

    // Record summary in backup_logs unless this is a preview-only call.
    if (!allowDisabledForPreview) {
      const summary = {
        policy: effectivePolicy,
        candidates: candidates.length,
        deleted_rows: deletedRows,
        deleted_files: deletedFiles,
        freed_bytes: freedBytes,
        dry_run: policy.dry_run,
        errors: errors.slice(0, 25),
      }
      await supabase.from('backup_logs').insert({
        backup_type: 'retention_sweep',
        status: errors.length > 0 ? 'completed_with_errors' : 'completed',
        backup_format: 'single',
        tables_count: 0,
        total_rows: deletedRows,
        file_size_bytes: freedBytes,
        completed_at: new Date().toISOString(),
        error_message: JSON.stringify(summary),
      })
    }

    return new Response(
      JSON.stringify({
        success: true,
        preview: allowDisabledForPreview,
        dry_run: policy.dry_run,
        candidate_count: candidates.length,
        deleted_rows: deletedRows,
        deleted_files: deletedFiles,
        freed_bytes: freedBytes,
        candidates: candidates.map((c) => ({
          id: c.id,
          status: c.status,
          created_at: c.created_at,
          reason: c.reason,
          file_size_bytes: c.file_size_bytes,
        })),
        errors,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('backup-retention-sweep error:', err)
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})