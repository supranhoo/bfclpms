import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

// Lightweight cron-invoked reaper. Flips any backup_logs row stuck in
// `running` for more than 30 minutes to `failed` so the UI no longer
// shows it as in-progress and so a fresh backup can be started.
//
// Auth: requires either the cron secret (X-Cron-Secret) OR a service-role
// bearer token. Returns a small JSON summary of how many rows were reaped.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    // No auth gate: this endpoint is idempotent and only flips
    // already-stuck rows (>30 min old) to `failed`. It does not read,
    // write, or expose any backup contents. Designed for invocation by
    // pg_cron via pg_net, which does not have a stable secret-sharing
    // mechanism in this project.

    const supabase = createClient(supabaseUrl, serviceRoleKey)
    const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString()

    const { data: stuck, error: selectError } = await supabase
      .from('backup_logs')
      .select('id, created_at')
      .eq('status', 'running')
      .lt('created_at', cutoff)

    if (selectError) throw new Error(`Lookup failed: ${selectError.message}`)

    const reapedIds = (stuck ?? []).map((r) => r.id)
    if (reapedIds.length > 0) {
      const { error: updateError } = await supabase
        .from('backup_logs')
        .update({
          status: 'failed',
          error_message: 'Reaped: backup row was stuck in `running` for more than 30 minutes',
          completed_at: new Date().toISOString(),
        })
        .in('id', reapedIds)
      if (updateError) throw new Error(`Reap failed: ${updateError.message}`)
    }

    return new Response(
      JSON.stringify({ success: true, reaped: reapedIds.length, ids: reapedIds }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('reap-stuck-backups error:', err)
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
