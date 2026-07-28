/**
 * ADR-190 / POLICY §EVIDENCE-READ-KPI-PARTICIPATION.
 *
 * Supabase Storage denials on a private bucket surface as an error object with
 * an empty body, which previously rendered as "Preview failed: {}". Normalise
 * any thrown value into a message a reviewer or employee can act on.
 */
const ACCESS_DENIED =
  'You do not have access to this file, or it is no longer available.';

export function normalizeEvidenceError(err: unknown, fallback = ACCESS_DENIED): string {
  if (typeof err === 'string') return err.trim() || fallback;

  if (err && typeof err === 'object') {
    const anyErr = err as { message?: unknown; error?: unknown; statusCode?: unknown };
    const raw =
      typeof anyErr.message === 'string'
        ? anyErr.message
        : typeof anyErr.error === 'string'
          ? anyErr.error
          : '';
    const message = raw.trim();
    if (!message || message === '{}' || message === '[object Object]') return fallback;

    const code = String(anyErr.statusCode ?? '');
    if (/not\s*found/i.test(message) || code === '404' || code === '400') {
      return ACCESS_DENIED;
    }
    if (/unauthor|forbidden|row-level security|permission/i.test(message) || code === '403') {
      return ACCESS_DENIED;
    }
    return message;
  }

  return fallback;
}

export const EVIDENCE_ACCESS_DENIED_MESSAGE = ACCESS_DENIED;
