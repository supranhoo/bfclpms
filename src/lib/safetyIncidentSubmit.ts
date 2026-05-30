/**
 * Phase 1.E — Single canonical "submit incident" routine.
 *
 * Used by:
 *   - SafetyIncidentNew (online happy path).
 *   - useSafetyOfflineSync (queue flush after reconnect).
 *
 * Always idempotent on the server side via `client_submission_id` UNIQUE.
 * If the row already exists from an earlier attempt, the server returns it
 * (handled below) and we proceed to upload any not-yet-stored evidence files.
 */

import { supabase } from '@/integrations/supabase/client';
import type { ReportIncidentInput } from '@/hooks/useSafetyIncidents';
import type { PendingIncidentFile } from '@/lib/safetyOfflineQueue';
import {
  compressImageFile,
  type CompressionPolicy,
} from '@/lib/imageCompression';

export interface SubmitIncidentArgs {
  reporterId: string;
  payload: ReportIncidentInput; // must include client_submission_id when retrying offline
  files: { name: string; type: string; size: number; blob: Blob | File }[];
  /**
   * Phase A — image compression policy + flag. Resolved by the caller
   * via `useImageCompressionSettings()`. When `enabled` is false (or the
   * file is not an image / too small / a GIF) compression is a no-op.
   */
  compression?: {
    enabled: boolean;
    policy?: Partial<CompressionPolicy>;
    severityHint?: 'low' | 'medium' | 'high' | 'critical' | null;
  };
}

export interface SubmitIncidentResult {
  id: string;
  incident_number: string;
  reused: boolean; // true if the row was found via client_submission_id (idempotent retry)
}

export async function submitSafetyIncident(
  args: SubmitIncidentArgs,
): Promise<SubmitIncidentResult> {
  const { reporterId, payload, files, compression } = args;

  if (!payload.client_submission_id) {
    throw new Error('client_submission_id is required for safe submission');
  }

  // 1) Server-authoritative submission via SECURITY DEFINER RPC.
  //    reporter_id is stamped server-side from auth.uid() — the value we
  //    pass here is ignored by the RPC. Dedup is atomic on
  //    (reporter_id, client_submission_id). See POLICY §Phase18-Safety.
  const { data: rpcData, error: rpcErr } = await supabase.rpc(
    'report_safety_incident' as never,
    { p_payload: payload as never } as never,
  );
  if (rpcErr) throw rpcErr;
  const rpcRow = rpcData as unknown as {
    id: string;
    incident_number: string;
    reused: boolean;
  };
  const row = { id: rpcRow.id, incident_number: rpcRow.incident_number };
  const reused = !!rpcRow.reused;

  // 2) Upload evidence — skip files whose path already exists in the table.
  const { data: existingEvidence } = await supabase
    .from('safety_incident_evidence')
    .select('file_name, size_bytes')
    .eq('incident_id', row.id)
    .eq('stage', 'report');

  const alreadyUploaded = new Set(
    (existingEvidence ?? []).map((e: any) => `${e.file_name}::${e.size_bytes}`),
  );

  for (const f of files) {
    const dedupKey = `${f.name}::${f.size}`;
    if (alreadyUploaded.has(dedupKey)) continue;

    // Best-effort client-side compression (Phase A). Falls back to the
    // original blob on any failure — never blocks the upload.
    let outName = f.name;
    let outType = f.type;
    let outSize = f.size;
    let outBody: Blob = f.blob;
    if (compression?.enabled !== false && f.blob instanceof File) {
      const result = await compressImageFile(f.blob, {
        enabled: compression?.enabled ?? true,
        policy: compression?.policy,
        severityHint: compression?.severityHint ?? payload.severity ?? null,
      });
      if (result.wasCompressed) {
        outBody = result.file;
        outName = result.file.name;
        outType = result.file.type;
        outSize = result.file.size;
      }
    }

    const safeName = outName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${reporterId}/${row.id}/report/${Date.now()}_${safeName}`;
    const { error: upErr } = await supabase.storage
      .from('safety-media')
      .upload(path, outBody, { contentType: outType });
    if (upErr) throw upErr;
    const { error: evErr } = await supabase
      .from('safety_incident_evidence')
      .insert({
        incident_id: row.id,
        stage: 'report',
        file_path: path,
        file_name: outName,
        mime_type: outType,
        size_bytes: outSize,
        uploaded_by: reporterId,
      } as never);
    if (evErr) throw evErr;
  }

  return { ...row, reused };
}

export function adaptPendingFiles(files: PendingIncidentFile[]) {
  return files.map((f) => ({ name: f.name, type: f.type, size: f.size, blob: f.blob }));
}