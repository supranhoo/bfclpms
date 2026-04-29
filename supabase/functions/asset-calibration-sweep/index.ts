/**
 * asset-calibration-sweep
 * -----------------------
 * Daily cron entry point for Safety Phase 4.
 *
 * 1. Calls public.mark_overdue_assets() for counts (idempotent).
 * 2. Loads assets matching T-7 / T-1 / overdue and writes one notification
 *    per asset×bucket via safety_notifications (best-effort; if the
 *    notifications table is missing on this environment, dispatch is
 *    skipped and counts are still returned).
 *
 * Auth: invoked by pg_cron with the service-role apikey header.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

type Bucket = 't7' | 't1' | 'overdue';

interface AssetRow {
  id: string;
  asset_code: string;
  name: string;
  business_unit_id: string | null;
  calibration_expires_at: string | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const summary: Record<string, unknown> = {};

  // 1) counts (also acts as a health probe for RLS / function presence)
  const { data: counts, error: rpcError } = await supabase.rpc('mark_overdue_assets');
  if (rpcError) {
    return json({ ok: false, step: 'rpc', error: rpcError.message }, 500);
  }
  summary.counts = counts;

  // 2) Pull buckets and best-effort notify
  const buckets: Array<{ key: Bucket; predicate: (a: AssetRow) => boolean }> = [
    {
      key: 't7',
      predicate: (a) => bucketDays(a.calibration_expires_at) === 7,
    },
    {
      key: 't1',
      predicate: (a) => bucketDays(a.calibration_expires_at) === 1,
    },
    {
      key: 'overdue',
      predicate: (a) => bucketDays(a.calibration_expires_at) <= 0,
    },
  ];

  const { data: assets, error: assetsError } = await supabase
    .from('safety_assets')
    .select('id, asset_code, name, business_unit_id, calibration_expires_at')
    .eq('calibration_required', true)
    .eq('status', 'active')
    .not('calibration_expires_at', 'is', null);

  if (assetsError) {
    return json(
      { ok: false, step: 'load_assets', error: assetsError.message, summary },
      500,
    );
  }

  let notifications = 0;
  for (const bucket of buckets) {
    const matched = (assets ?? []).filter((a) => bucket.predicate(a as AssetRow));
    for (const a of matched) {
      const inserted = await tryInsertNotification(supabase, a as AssetRow, bucket.key);
      if (inserted) notifications += 1;
    }
  }
  summary.notifications_attempted = notifications;

  return json({ ok: true, summary }, 200);
});

function bucketDays(expiresAt: string | null): number {
  if (!expiresAt) return Number.POSITIVE_INFINITY;
  const ms = new Date(expiresAt).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

async function tryInsertNotification(
  supabase: ReturnType<typeof createClient>,
  asset: AssetRow,
  bucket: Bucket,
): Promise<boolean> {
  // Best-effort: project may or may not have safety_notifications.
  const payload = {
    kind: `asset.calibration.${bucket}`,
    target_type: 'safety_asset',
    target_id: asset.id,
    business_unit_id: asset.business_unit_id,
    title: `Calibration ${bucket === 'overdue' ? 'overdue' : `due in ${bucket === 't7' ? '7' : '1'} day${bucket === 't7' ? 's' : ''}`}: ${asset.asset_code}`,
    body: `${asset.name} (${asset.asset_code}) — expires ${asset.calibration_expires_at}`,
    payload: { asset_id: asset.id, bucket, expires_at: asset.calibration_expires_at },
    dedupe_key: `asset:${asset.id}:${bucket}:${(asset.calibration_expires_at ?? '').slice(0, 10)}`,
  };
  const { error } = await supabase.from('safety_notifications').insert(payload);
  if (error) return false;
  return true;
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}