import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

/**
 * Daily reminder cron for the Annual Review module.
 *
 * For each active cycle, pulls the active reviewer + deadline per pending
 * instance via `list_annual_review_pending_reviewers`, then inserts an in-app
 * `notifications` row for reviewers whose deadline is within `WARN_DAYS` or
 * already overdue. Dedupes by (user_id, instance_id, day) — at most one
 * reminder per reviewer per instance per day.
 */
const WARN_DAYS = 3;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    // Auth: either a valid cron secret (scheduled invocation) OR an
    // authenticated admin user (manual run from the admin UI).
    const cronSecret = req.headers.get('x-cron-secret');
    const expected = Deno.env.get('CRON_SECRET');
    const cronOk = !!expected && cronSecret === expected;

    let adminOk = false;
    const authHeader = req.headers.get('Authorization');
    if (!cronOk && authHeader?.startsWith('Bearer ')) {
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const token = authHeader.replace('Bearer ', '');
      const { data: claims } = await userClient.auth.getClaims(token);
      const uid = claims?.claims?.sub;
      if (uid) {
        const { data: isAdmin } = await userClient.rpc('has_role', {
          _user_id: uid, _role: 'admin',
        });
        adminOk = !!isAdmin;
      }
    }

    if (!cronOk && !adminOk) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: cycles, error: cErr } = await supabase
      .from('annual_review_cycles').select('id, name').eq('status', 'active');
    if (cErr) throw cErr;

    const today = new Date().toISOString().slice(0, 10);
    let queued = 0, skipped = 0;

    for (const cyc of (cycles ?? [])) {
      const { data: pending, error: pErr } = await supabase.rpc(
        'list_annual_review_pending_reviewers',
        { p_cycle_id: cyc.id },
      );
      if (pErr) throw pErr;

      for (const row of (pending ?? []) as Array<{
        instance_id: string; reviewer_id: string | null; employee_name: string | null;
        stage: string; deadline: string | null; days_to_deadline: number | null;
      }>) {
        if (!row.reviewer_id) { skipped++; continue; }
        if (row.days_to_deadline === null) { skipped++; continue; }
        if (row.days_to_deadline > WARN_DAYS) { skipped++; continue; }

        // Dedupe: skip if a reminder already exists today for this user+instance.
        const { data: dup } = await supabase
          .from('notifications')
          .select('id')
          .eq('user_id', row.reviewer_id)
          .eq('type', 'annual_review_reminder')
          .gte('created_at', `${today}T00:00:00Z`)
          .contains('metadata', { instance_id: row.instance_id })
          .limit(1)
          .maybeSingle();
        if (dup) { skipped++; continue; }

        const overdue = row.days_to_deadline < 0;
        const title = overdue ? 'Annual review overdue' : 'Annual review deadline approaching';
        const msg = overdue
          ? `${row.employee_name ?? 'A review'} is overdue by ${Math.abs(row.days_to_deadline)} day(s).`
          : `${row.employee_name ?? 'A review'} is due in ${row.days_to_deadline} day(s).`;

        const { error: insErr } = await supabase.from('notifications').insert({
          user_id: row.reviewer_id,
          type: 'annual_review_reminder',
          title, message: msg,
          metadata: {
            instance_id: row.instance_id,
            cycle_id: cyc.id,
            stage: row.stage,
            deadline: row.deadline,
            days_to_deadline: row.days_to_deadline,
          },
        });
        if (insErr) { skipped++; continue; }
        queued++;
      }
    }

    return new Response(
      JSON.stringify({ success: true, queued, skipped, cycles: cycles?.length ?? 0 }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});