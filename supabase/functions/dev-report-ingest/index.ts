/**
 * dev-report-ingest
 *
 * Auto-capture entry point for the Development Report. Admin/service-role only.
 * Idempotent on (entry_type, entry_date, linked_commit, title) — re-runs are
 * safe and will not create duplicate rows. See POLICY.md §131 (Dev Report
 * Auto-Capture Pipeline).
 *
 * Request body:
 *   {
 *     "entries": [
 *       {
 *         "entry_type": "feature" | "bug" | "timeline",
 *         "entry_date": "YYYY-MM-DD",   // optional but recommended
 *         "title": "string (required)",
 *         "description": "string (required)",
 *         "module_area": "string?",
 *         "status": "string?",
 *         "severity": "string?",
 *         "timeline_type": "string?",
 *         "period_label": "string?",
 *         "adr_refs": ["ADR-090"]?,
 *         "linked_commit": "sha?"
 *       },
 *       ...
 *     ]
 *   }
 */
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { requireAdminUser } from '../_shared/admin-auth.ts';

interface IngestEntry {
  entry_type: 'feature' | 'bug' | 'timeline';
  entry_date?: string | null;
  title: string;
  description: string;
  rationale?: string | null;
  usage_notes?: string | null;
  module_area?: string | null;
  status?: string | null;
  severity?: string | null;
  timeline_type?: string | null;
  period_label?: string | null;
  adr_refs?: string[];
  linked_commit?: string | null;
}

function validate(e: unknown): e is IngestEntry {
  if (!e || typeof e !== 'object') return false;
  const x = e as Record<string, unknown>;
  if (!['feature', 'bug', 'timeline'].includes(x.entry_type as string)) return false;
  if (typeof x.title !== 'string' || !x.title.trim()) return false;
  if (typeof x.description !== 'string' || !x.description.trim()) return false;
  return true;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const auth = await requireAdminUser(req);
  if (!auth.authorized || !auth.adminClient) {
    return new Response(JSON.stringify({ error: auth.error ?? 'Unauthorized' }), {
      status: auth.status ?? 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const list = (body as { entries?: unknown[] })?.entries;
  if (!Array.isArray(list) || list.length === 0) {
    return new Response(JSON.stringify({ error: 'entries[] required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const rejected: Array<{ index: number; reason: string }> = [];
  const valid: IngestEntry[] = [];
  list.forEach((e, i) => {
    if (validate(e)) valid.push(e);
    else rejected.push({ index: i, reason: 'Invalid payload shape' });
  });

  const inserted: string[] = [];
  const skipped: string[] = [];
  const enriched: string[] = [];

  // Per-row upsert against the (entry_type, entry_date, linked_commit, title)
  // unique index. We avoid bulk upsert because the index expression uses
  // COALESCE — PostgREST's onConflict needs literal columns. Per-row check
  // keeps idempotency precise and side-effect free.
  for (const e of valid) {
    const baseQ = auth.adminClient
      .from('dev_report_entries')
      .select('id, rationale, usage_notes')
      .eq('entry_type', e.entry_type)
      .eq('title', e.title)
      .limit(1);

    const existingQ = e.linked_commit
      ? baseQ.eq('linked_commit', e.linked_commit)
      : baseQ.is('linked_commit', null);

    const existingScoped = e.entry_date
      ? existingQ.eq('entry_date', e.entry_date)
      : existingQ.is('entry_date', null);

    const { data: found, error: lookupErr } = await existingScoped;
    if (lookupErr) {
      rejected.push({ index: -1, reason: `lookup failed: ${lookupErr.message}` });
      continue;
    }
    if (found && found.length > 0) {
      // ADR-249: enrich existing rows with What/Why/How only when empty —
      // never overwrite an admin's manual detail with a NULL resync value.
      const row = found[0] as { id: string; rationale: string | null; usage_notes: string | null };
      const patch: Record<string, string> = {};
      if (!row.rationale && e.rationale) patch.rationale = e.rationale;
      if (!row.usage_notes && e.usage_notes) patch.usage_notes = e.usage_notes;
      if (Object.keys(patch).length > 0) {
        const { error: updErr } = await auth.adminClient
          .from('dev_report_entries')
          .update(patch)
          .eq('id', row.id);
        if (updErr) rejected.push({ index: -1, reason: `enrich failed: ${updErr.message}` });
        else enriched.push(row.id);
      }
      skipped.push(found[0].id);
      continue;
    }

    const { data: ins, error: insErr } = await auth.adminClient
      .from('dev_report_entries')
      .insert({
        entry_type: e.entry_type,
        entry_date: e.entry_date ?? null,
        title: e.title,
        description: e.description,
        rationale: e.rationale ?? null,
        usage_notes: e.usage_notes ?? null,
        module_area: e.module_area ?? null,
        status: e.status ?? null,
        severity: e.severity ?? null,
        timeline_type: e.timeline_type ?? null,
        period_label: e.period_label ?? null,
        adr_refs: e.adr_refs ?? [],
        linked_commit: e.linked_commit ?? null,
        // Automated capture: per workspace policy, performed_by = NULL.
        created_by: null,
      })
      .select('id')
      .single();

    if (insErr) {
      rejected.push({ index: -1, reason: insErr.message });
      continue;
    }
    if (ins?.id) inserted.push(ins.id);
  }

  return new Response(
    JSON.stringify({
      ok: true,
      received: list.length,
      inserted: inserted.length,
      skipped_duplicates: skipped.length,
      enriched: enriched.length,
      rejected,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});