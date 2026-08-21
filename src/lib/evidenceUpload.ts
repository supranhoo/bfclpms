/**
 * Evidence upload identity & path helpers (POLICY §EVIDENCE-SESSION-BOUND-UPLOAD,
 * ADR-305).
 *
 * The storage INSERT policy for the `review-evidence` bucket scopes every file
 * to the caller's own folder:
 *
 *   bucket_id = 'review-evidence'
 *   AND auth.uid()::text = (storage.foldername(name))[1]
 *
 * So the folder prefix MUST come from the live auth session, never from
 * in-memory React state. A cached user object can survive a silent token
 * refresh failure; the request then reaches Postgres with `auth.uid() = NULL`
 * and storage returns "new row violates row-level security policy". This module
 * keeps that identity resolution, path building, and failure classification in
 * one pure, testable place.
 */

import { supabase } from '@/integrations/supabase/client';

export interface UploadIdentity {
  /** Resolved, live session user id used as the folder prefix. */
  id: string;
  /** True when the resolved id matches the caller-supplied cached user id. */
  matchesCachedUser: boolean;
}

/**
 * Resolve the acting user id from the live auth session. Returns null when
 * there is no session (or it has no user) — callers must abort the upload.
 */
export async function resolveUploadIdentity(
  cachedUserId: string,
): Promise<UploadIdentity | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const liveId = session?.user?.id ?? null;
  if (!liveId) return null;

  return {
    id: liveId,
    matchesCachedUser: liveId === cachedUserId,
  };
}

/** Build the storage path from the resolved session user id. */
export function buildEvidenceFilePath(input: {
  userId: string;
  contextId: string;
  folder: string;
  file: File;
  ext: string;
}): string {
  const { userId, contextId, folder, file, ext } = input;
  const timestamp = Date.now();
  const sanitizedName = file.name
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .substring(0, 40);
  return `${userId}/${contextId}/${folder}/${timestamp}_${sanitizedName}.${ext}`;
}

/** True when the storage error is a row-level-security policy denial. */
export function isRlsDenialError(error: any): boolean {
  const message = String(error?.message ?? error ?? '').toLowerCase();
  return message.includes('row-level security') || message.includes('row level security');
}

/** Human message for the upload failure, keeping the raw reason available. */
export function describeUploadFailure(error: any, fallbackName: string): {
  title: string;
  message: string;
  detail: string;
} {
  const raw = error?.message || `Failed to upload "${fallbackName}"`;
  if (isRlsDenialError(error)) {
    return {
      title: 'Sign in again to attach files',
      message:
        'Your session expired, so the file could not be saved. Sign in again and retry.',
      detail: raw,
    };
  }
  return { title: 'Upload failed', message: raw, detail: raw };
}
