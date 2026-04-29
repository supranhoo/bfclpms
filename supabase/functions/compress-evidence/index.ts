// Background WebP re-encoder for Safety + PMS evidence images.
// Triggered by pg_cron every 2 minutes. Idempotent and resilient.
//
// Pipeline:
//   1. Read system_settings (server_compression_enabled / server_compression_pms_rewrite).
//   2. Pull up to BATCH_SIZE pending Safety evidence rows + PMS jobs.
//   3. For each: download original from Storage, decode (jpeg/png/heic), re-encode WebP @ q=85.
//   4. Upload sibling .webp into the same bucket/folder.
//   5. Update the source row (Safety: file_path/mime_type/size_bytes; PMS: rewrite jsonb url IF flag enabled).
//   6. Mark job 'done' / 'failed' with attempts++.
//
// SAFETY: original storage object is preserved for 7 days (cleaned by a separate job, not here).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { decode as decodeJpeg } from 'https://esm.sh/@jsquash/jpeg@1.5.0?bundle';
import { decode as decodePng } from 'https://esm.sh/@jsquash/png@3.0.1?bundle';
import { encode as encodeWebp } from 'https://esm.sh/@jsquash/webp@1.4.0?bundle';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BATCH_SIZE = 8;
const MAX_ATTEMPTS = 3;
const WEBP_QUALITY = 85;

interface Settings {
  enabled: boolean;
  pmsRewrite: boolean;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function admin() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function readSettings(sb: ReturnType<typeof admin>): Promise<Settings> {
  const { data } = await sb
    .from('system_settings')
    .select('setting_key, setting_value')
    .in('setting_key', ['server_compression_enabled', 'server_compression_pms_rewrite']);
  const map = new Map<string, unknown>();
  for (const row of data ?? []) map.set(row.setting_key, row.setting_value);
  const parse = (v: unknown, dflt: boolean) => {
    if (v === null || v === undefined) return dflt;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') return v !== 'false' && v !== '0';
    return dflt;
  };
  return {
    enabled: parse(map.get('server_compression_enabled'), true),
    pmsRewrite: parse(map.get('server_compression_pms_rewrite'), false),
  };
}

/** Resolve a Supabase Storage public/signed URL or bucket-relative path into { bucket, path }. */
function parseStorageUrl(url: string): { bucket: string; path: string } | null {
  // public: <SUPABASE_URL>/storage/v1/object/public/<bucket>/<path>
  // signed: <SUPABASE_URL>/storage/v1/object/sign/<bucket>/<path>?token=
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+)$/);
    if (m) return { bucket: m[1], path: decodeURIComponent(m[2]) };
  } catch (_) {
    // not a full URL — assume "<bucket>/<path>"
  }
  const slash = url.indexOf('/');
  if (slash > 0) return { bucket: url.slice(0, slash), path: url.slice(slash + 1) };
  return null;
}

async function decodeImage(bytes: Uint8Array, mime: string): Promise<ImageData | null> {
  const m = mime.toLowerCase();
  if (m.includes('jpeg') || m.includes('jpg')) return decodeJpeg(bytes);
  if (m.includes('png')) return decodePng(bytes);
  // HEIC not supported by jsquash; client should have re-encoded already.
  return null;
}

function siblingWebpPath(path: string): string {
  return path.replace(/\.[^.]+$/, '') + '.webp';
}

async function compressOne(
  sb: ReturnType<typeof admin>,
  bucket: string,
  origPath: string,
  mime: string,
): Promise<{ webpPath: string; webpSize: number; webpUrl: string } | { error: string }> {
  const dl = await sb.storage.from(bucket).download(origPath);
  if (dl.error || !dl.data) return { error: `download_failed: ${dl.error?.message ?? 'no data'}` };
  const buf = new Uint8Array(await dl.data.arrayBuffer());

  const img = await decodeImage(buf, mime);
  if (!img) return { error: `decode_unsupported: ${mime}` };

  const webp = await encodeWebp(img, { quality: WEBP_QUALITY });
  const webpBytes = new Uint8Array(webp);

  // Don't bother if WebP is bigger than original.
  if (webpBytes.length >= buf.length) {
    return { error: 'no_savings' };
  }

  const webpPath = siblingWebpPath(origPath);
  const up = await sb.storage.from(bucket).upload(webpPath, webpBytes, {
    contentType: 'image/webp',
    upsert: true,
    cacheControl: '31536000',
  });
  if (up.error) return { error: `upload_failed: ${up.error.message}` };

  const { data: pub } = sb.storage.from(bucket).getPublicUrl(webpPath);
  return { webpPath, webpSize: webpBytes.length, webpUrl: pub.publicUrl };
}

// ---------------- Safety processor ----------------
async function processSafetyBatch(sb: ReturnType<typeof admin>) {
  const { data: rows } = await sb
    .from('safety_incident_evidence')
    .select('id, file_path, mime_type, size_bytes, compression_attempts')
    .in('compression_status', ['pending', 'failed'])
    .lt('compression_attempts', MAX_ATTEMPTS)
    .order('uploaded_at', { ascending: true })
    .limit(BATCH_SIZE);

  const results: Array<{ id: string; status: string; saved?: number }> = [];
  for (const row of rows ?? []) {
    await sb
      .from('safety_incident_evidence')
      .update({ compression_status: 'processing', compression_attempts: (row.compression_attempts ?? 0) + 1 })
      .eq('id', row.id);

    const out = await compressOne(sb, 'safety-media', row.file_path, row.mime_type ?? 'image/jpeg');
    if ('error' in out) {
      const terminal = out.error === 'no_savings' || out.error.startsWith('decode_unsupported');
      await sb
        .from('safety_incident_evidence')
        .update({
          compression_status: terminal ? 'skipped' : 'failed',
          compression_error: out.error,
        })
        .eq('id', row.id);
      results.push({ id: row.id, status: terminal ? 'skipped' : 'failed' });
      continue;
    }

    await sb
      .from('safety_incident_evidence')
      .update({
        original_file_path: row.file_path,
        original_size_bytes: row.size_bytes,
        file_path: out.webpPath,
        mime_type: 'image/webp',
        size_bytes: out.webpSize,
        compression_status: 'done',
        compressed_at: new Date().toISOString(),
        compression_error: null,
      })
      .eq('id', row.id);
    results.push({ id: row.id, status: 'done', saved: (row.size_bytes ?? 0) - out.webpSize });
  }
  return results;
}

// ---------------- PMS processor ----------------
async function processPmsBatch(sb: ReturnType<typeof admin>, rewrite: boolean) {
  const { data: jobs } = await sb
    .from('pms_evidence_compression_jobs')
    .select('*')
    .in('status', ['pending', 'failed'])
    .lt('attempts', MAX_ATTEMPTS)
    .order('enqueued_at', { ascending: true })
    .limit(BATCH_SIZE);

  const results: Array<{ id: string; status: string }> = [];
  for (const job of jobs ?? []) {
    await sb
      .from('pms_evidence_compression_jobs')
      .update({ status: 'processing', attempts: (job.attempts ?? 0) + 1 })
      .eq('id', job.id);

    const parsed = parseStorageUrl(job.original_url);
    if (!parsed) {
      await sb
        .from('pms_evidence_compression_jobs')
        .update({ status: 'skipped', last_error: 'not_a_storage_url' })
        .eq('id', job.id);
      results.push({ id: job.id, status: 'skipped' });
      continue;
    }

    const guessMime = parsed.path.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
    const out = await compressOne(sb, parsed.bucket, parsed.path, guessMime);
    if ('error' in out) {
      const terminal = out.error === 'no_savings' || out.error.startsWith('decode_unsupported');
      await sb
        .from('pms_evidence_compression_jobs')
        .update({
          status: terminal ? 'skipped' : 'failed',
          last_error: out.error,
          processed_at: new Date().toISOString(),
        })
        .eq('id', job.id);
      results.push({ id: job.id, status: terminal ? 'skipped' : 'failed' });
      continue;
    }

    // WebP exists in storage. Optionally rewrite the source JSONB url.
    let rewroteAt: string | null = null;
    if (rewrite && job.source_table === 'review_submissions' && job.array_index !== null) {
      const { data: row } = await sb
        .from('review_submissions')
        .select(job.source_column)
        .eq('id', job.source_id)
        .single();
      const arr = (row as Record<string, unknown> | null)?.[job.source_column];
      if (Array.isArray(arr) && arr[job.array_index] === job.original_url) {
        const next = [...arr];
        next[job.array_index] = out.webpUrl;
        await sb
          .from('review_submissions')
          .update({ [job.source_column]: next })
          .eq('id', job.source_id);
        rewroteAt = new Date().toISOString();
      }
    }

    await sb
      .from('pms_evidence_compression_jobs')
      .update({
        status: 'done',
        compressed_url: out.webpUrl,
        compressed_path: out.webpPath,
        compressed_size_bytes: out.webpSize,
        processed_at: new Date().toISOString(),
        rewritten_at: rewroteAt,
        last_error: null,
      })
      .eq('id', job.id);
    results.push({ id: job.id, status: 'done' });
  }
  return results;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const sb = admin();
    const settings = await readSettings(sb);
    if (!settings.enabled) {
      return jsonResponse({ ok: true, skipped: 'disabled_via_setting' });
    }
    const safety = await processSafetyBatch(sb);
    const pms = await processPmsBatch(sb, settings.pmsRewrite);
    return jsonResponse({ ok: true, safety, pms, pmsRewrite: settings.pmsRewrite });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) }, 500);
  }
});