import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * safety-drill — Phase 1.5 backup→restore sandbox verification.
 *
 * Round-trips the three flagship Safety tables (safety_incidents,
 * safety_permits, safety_audit_runs) through storage into an isolated
 * `safety_drill` Postgres schema and reports row-count deltas. The live
 * `public` schema is never touched.
 *
 * Body: { backup_id?: string }
 *   - if backup_id is omitted: takes an inline snapshot of the 3 tables,
 *     uploads them to `database-backups/drills/<drill_id>/`, then reads
 *     them back and inserts into safety_drill.*.
 *   - if backup_id is provided: reads <table>.json files from that
 *     backup's storage folder instead (Flow B — verifies a real
 *     create-backup artifact end-to-end).
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

const DRILL_TABLES = [
  'safety_incidents',
  'safety_permits',
  'safety_audit_runs',
] as const

type DrillTable = (typeof DRILL_TABLES)[number]
type Counts = Record<DrillTable, number>

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Caller auth: must be authenticated; RPC enforces admin/safety_head.
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader) return jsonRes({ error: 'Authorization required' }, 401)

    // Service-role client targeting public for RPC + storage.
    const admin = createClient(supabaseUrl, serviceKey)
    // Caller-scoped client just to validate JWT identity for audit trail.
    const caller = createClient(supabaseUrl, serviceKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userRes } = await caller.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    const user = userRes?.user
    if (!user) return jsonRes({ error: 'Invalid token' }, 401)

    const body = (await req.json().catch(() => ({}))) as { backup_id?: string }
    const drillId = crypto.randomUUID()
    const startedAt = new Date().toISOString()

    // ---------- Phase 1: seed sandbox from live tables (RPC enforces RBAC) ----------
    // We need to call the RPC AS the user (so has_role/has_safety_role can see auth.uid()).
    const callerRpc = createClient(supabaseUrl, serviceKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: seedRes, error: seedErr } = await callerRpc.rpc('safety_drill_seed')
    if (seedErr) return jsonRes({ error: `seed failed: ${seedErr.message}` }, 403)
    const baseline = seedRes as Counts

    // ---------- Phase 2: snapshot rows to storage ----------
    const snapshot: Record<DrillTable, unknown[]> = {
      safety_incidents: [],
      safety_permits: [],
      safety_audit_runs: [],
    }

    if (body.backup_id) {
      // Flow B — read from a real create-backup artifact
      const { data: log, error: logErr } = await admin
        .from('backup_logs')
        .select('file_path')
        .eq('id', body.backup_id)
        .single()
      if (logErr || !log?.file_path) {
        return jsonRes({ error: `backup_logs row missing: ${logErr?.message}` }, 404)
      }
      // file_path looks like "<folder>/manifest.json"; strip manifest filename
      const folder = log.file_path.replace(/\/manifest\.json$/, '')
      for (const t of DRILL_TABLES) {
        const { data: file, error: dlErr } = await admin.storage
          .from('database-backups')
          .download(`${folder}/${t}.json`)
        if (dlErr || !file) {
          return jsonRes(
            { error: `download ${t}.json failed: ${dlErr?.message ?? 'no file'}` },
            500
          )
        }
        snapshot[t] = JSON.parse(await file.text()) as unknown[]
      }
    } else {
      // Flow A — inline snapshot via service-role select from sandbox copies
      // (sandbox now holds the seed rows). This proves the storage round-trip
      // without invoking the full create-backup pipeline.
      const drillClient = createClient(supabaseUrl, serviceKey, {
        db: { schema: 'safety_drill' },
      })
      const drillFolder = `drills/${drillId}`
      for (const t of DRILL_TABLES) {
        const { data: rows, error: selErr } = await drillClient
          .from(t)
          .select('*')
        if (selErr) return jsonRes({ error: `select ${t}: ${selErr.message}` }, 500)
        snapshot[t] = rows ?? []
        const { error: upErr } = await admin.storage
          .from('database-backups')
          .upload(
            `${drillFolder}/${t}.json`,
            new Blob([JSON.stringify(rows ?? [])], { type: 'application/json' }),
            { upsert: true, contentType: 'application/json' }
          )
        if (upErr) return jsonRes({ error: `upload ${t}: ${upErr.message}` }, 500)
      }
    }

    // ---------- Phase 3: wipe sandbox, re-insert from snapshot ----------
    const { error: truncErr } = await callerRpc.rpc('safety_drill_truncate')
    if (truncErr) return jsonRes({ error: `truncate: ${truncErr.message}` }, 500)

    const drillSchema = createClient(supabaseUrl, serviceKey, {
      db: { schema: 'safety_drill' },
    })
    const insertErrors: string[] = []
    for (const t of DRILL_TABLES) {
      const rows = snapshot[t]
      if (!rows.length) continue
      const { error } = await drillSchema.from(t).insert(rows)
      if (error) insertErrors.push(`insert ${t}: ${error.message}`)
    }

    // ---------- Phase 4: verify ----------
    const { data: afterRes, error: cntErr } = await callerRpc.rpc('safety_drill_counts')
    if (cntErr) return jsonRes({ error: `counts: ${cntErr.message}` }, 500)
    const after = afterRes as Counts

    const deltas: Array<{ table: DrillTable; baseline: number; after: number; ok: boolean }> =
      DRILL_TABLES.map((t) => ({
        table: t,
        baseline: baseline[t] ?? 0,
        after: after[t] ?? 0,
        ok: (baseline[t] ?? 0) === (after[t] ?? 0),
      }))
    const allOk = deltas.every((d) => d.ok) && insertErrors.length === 0

    return jsonRes({
      ok: allOk,
      drill_id: drillId,
      backup_id: body.backup_id ?? null,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      baseline,
      after,
      deltas,
      errors: insertErrors.length ? insertErrors : null,
      performed_by: user.id,
    })
  } catch (err) {
    console.error('safety-drill error:', err)
    return jsonRes({ error: String((err as Error).message ?? err) }, 500)
  }
})