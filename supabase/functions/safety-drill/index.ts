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

    // Detect system mode (scheduled cron uses the service-role key directly).
    const bearer = authHeader.replace(/^Bearer\s+/i, '')
    const isSystem = bearer === serviceKey

    let performedBy: string | null = null
    if (!isSystem) {
      const caller = createClient(supabaseUrl, serviceKey, {
        global: { headers: { Authorization: authHeader } },
      })
      const { data: userRes } = await caller.auth.getUser(bearer)
      const user = userRes?.user
      if (!user) return jsonRes({ error: 'Invalid token' }, 401)
      performedBy = user.id
    }

    const body = (await req.json().catch(() => ({}))) as { backup_id?: string }
    const drillId = crypto.randomUUID()
    const startedAt = new Date().toISOString()

    // For user calls we must pass the user JWT so RPC role checks see auth.uid().
    // For system calls we use the service-role admin client (RPCs allow service_role).
    const callerRpc = isSystem
      ? admin
      : createClient(supabaseUrl, serviceKey, {
          global: { headers: { Authorization: authHeader } },
        })

    // ---------- Phase 1: seed sandbox from live tables (RPC enforces RBAC) ----------
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
      // Flow A — inline snapshot via SECURITY DEFINER RPC that reads from the
      // sandbox schema (PostgREST cannot reach safety_drill directly).
      const drillFolder = `drills/${drillId}`
      for (const t of DRILL_TABLES) {
        const { data: rows, error: selErr } = await callerRpc.rpc(
          'safety_drill_dump',
          { _table: t }
        )
        if (selErr) return jsonRes({ error: `dump ${t}: ${selErr.message}` }, 500)
        snapshot[t] = (rows as unknown[]) ?? []
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

    const insertErrors: string[] = []
    for (const t of DRILL_TABLES) {
      const rows = snapshot[t]
      if (!rows.length) continue
      const { error } = await callerRpc.rpc('safety_drill_load', {
        _table: t,
        _rows: rows,
      })
      if (error) insertErrors.push(`load ${t}: ${error.message}`)
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

    const finishedAt = new Date().toISOString()
    const result = {
      ok: allOk,
      drill_id: drillId,
      backup_id: body.backup_id ?? null,
      started_at: startedAt,
      finished_at: finishedAt,
      baseline,
      after,
      deltas,
      errors: insertErrors.length ? insertErrors : null,
      performed_by: performedBy,
    }

    // Persist run history (best-effort; never block the response on logging).
    try {
      await admin.from('safety_drill_runs').insert({
        drill_id: drillId,
        backup_id: body.backup_id ?? null,
        ok: allOk,
        started_at: startedAt,
        finished_at: finishedAt,
        baseline,
        after,
        deltas,
        errors: insertErrors.length ? insertErrors : null,
        performed_by: performedBy,
        system_run: isSystem,
      })
    } catch (logErr) {
      console.error('safety-drill: failed to log run', logErr)
    }

    return jsonRes(result)
  } catch (err) {
    console.error('safety-drill error:', err)
    return jsonRes({ error: String((err as Error).message ?? err) }, 500)
  }
})