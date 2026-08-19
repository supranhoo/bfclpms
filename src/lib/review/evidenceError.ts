/**
 * ADR-190 / POLICY §EVIDENCE-READ-KPI-PARTICIPATION.
 *
 * Supabase Storage denials on a private bucket surface as an error object with
 * an empty body, which previously rendered as "Preview failed: {}". Normalise
 * any thrown value into a message a reviewer or employee can act on.
 */
const ACCESS_DENIED =
  'You do not have access to this file, or it is no longer available.';

/**
 * ADR-250. Transient failures (statement timeout, storage 544, 5xx, aborted
 * fetch, offline) were previously collapsed into ACCESS_DENIED, which told
 * reviewers they lacked permission when the real cause was a busy backend.
 */
const SERVER_BUSY =
  'The file server is busy right now — please retry in a moment.';

/**
 * ADR-298 / POLICY §EVIDENCE-PREVIEW-FAILURE-CLARITY. A fetch that never
 * reaches the server (browser extension, ad-blocker, corporate proxy, offline)
 * is NOT retryable — telling the user the server is "busy" sends them into an
 * endless retry loop for a problem retry cannot solve.
 */
const NETWORK_BLOCKED =
  "We couldn't reach the file server. This is usually a browser extension, ad-blocker or office network blocking the download — try another browser, or use Download instead.";

/**
 * ADR-300 / POLICY §EVIDENCE-PREVIEW-TRANSPORT-FALLBACK. A request that is
 * accepted but never answered (no HTTP status, killed by our own timeout) is a
 * HANG, not "server busy": the server never told us it was busy. Reporting it
 * as busy sent users into a retry loop on a transport that was already stuck.
 */
const HUNG =
  "The file didn't respond in time. We tried an alternative route — if it still fails, use Download, or try another browser or network.";

/** Marker for our own per-attempt / overall preview timeouts. */
export const EVIDENCE_TIMEOUT_ERROR_NAME = 'EvidenceTimeoutError';

export class EvidenceTimeoutError extends Error {
  constructor(message = HUNG) {
    super(message);
    this.name = EVIDENCE_TIMEOUT_ERROR_NAME;
  }
}

function errorText(err: unknown): string {
  const anyErr = err as { name?: unknown; message?: unknown; error?: unknown };
  return (
    typeof err === 'string'
      ? err
      : [anyErr?.name, anyErr?.message, anyErr?.error].filter((v) => typeof v === 'string').join(' ')
  ).toLowerCase();
}

/** True when WE gave up waiting and the server never answered at all. */
export function isHungEvidenceError(err: unknown): boolean {
  if (err == null) return false;
  if (String((err as { statusCode?: unknown })?.statusCode ?? '')) return false;
  return errorText(err).includes(EVIDENCE_TIMEOUT_ERROR_NAME.toLowerCase());
}

/** True when the request never reached the server (no HTTP status at all). */
export function isNetworkBlockedEvidenceError(err: unknown): boolean {
  if (err == null) return false;
  if (isHungEvidenceError(err)) return false;
  const code = String((err as { statusCode?: unknown })?.statusCode ?? '');
  if (code) return false; // a status means the server answered
  const text = errorText(err);
  if (!text) return false;
  return (
    text.includes('failed to fetch') ||
    text.includes('networkerror') ||
    text.includes('network error') ||
    text.includes('load failed') ||
    text.includes('err_blocked') ||
    text.includes('err_connection') ||
    text.includes('err_internet_disconnected')
  );
}

export function isTransientEvidenceError(err: unknown): boolean {
  if (err == null) return false;
  if (isHungEvidenceError(err)) return false;

  const anyErr = err as { name?: unknown; message?: unknown; error?: unknown; statusCode?: unknown };
  const code = String(anyErr?.statusCode ?? '');
  if (/^5\d\d$/.test(code) || code === '544' || code === '408' || code === '429') return true;

  const text = (
    typeof err === 'string'
      ? err
      : [anyErr?.name, anyErr?.message, anyErr?.error].filter((v) => typeof v === 'string').join(' ')
  ).toLowerCase();

  if (!text) return false;
  return (
    text.includes('timed out') ||
    text.includes('timeout') ||
    text.includes('aborterror') ||
    text.includes('aborted') ||
    text.includes('failed to fetch') ||
    text.includes('networkerror') ||
    text.includes('network error') ||
    text.includes('connection') ||
    text.includes('canceling statement') ||
    text.includes('too many requests') ||
    text.includes('service unavailable') ||
    text.includes('bad gateway') ||
    text.includes('gateway timeout') ||
    text.includes('57014')
  );
}

export function normalizeEvidenceError(err: unknown, fallback = ACCESS_DENIED): string {
  // A hang is neither a denial nor an answered "busy" response.
  if (isHungEvidenceError(err)) return HUNG;

  // A blocked/unreachable fetch must be named as such, never as "busy".
  if (isNetworkBlockedEvidenceError(err)) return NETWORK_BLOCKED;

  // Transient backend pressure must never be reported as a permission problem.
  if (isTransientEvidenceError(err)) return SERVER_BUSY;

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
export const EVIDENCE_SERVER_BUSY_MESSAGE = SERVER_BUSY;
export const EVIDENCE_NETWORK_BLOCKED_MESSAGE = NETWORK_BLOCKED;
export const EVIDENCE_HUNG_MESSAGE = HUNG;

/** Structured, copyable diagnostics for support — never contains file bytes. */
export function describeEvidenceFailure(
  err: unknown,
  ctx: {
    bucket?: string | null;
    kpiId?: string | null;
    elapsedMs?: number;
    attempts?: number;
    transport?: string | null;
    fallback?: string | null;
  },
): string {
  const anyErr = err as { name?: unknown; message?: unknown; statusCode?: unknown };
  const parts = [
    `status=${String(anyErr?.statusCode ?? 'none')}`,
    `name=${String(anyErr?.name ?? (typeof err === 'string' ? 'string' : 'unknown'))}`,
    `msg=${String(anyErr?.message ?? (typeof err === 'string' ? err : '')).slice(0, 160) || 'none'}`,
    `elapsed=${ctx.elapsedMs ?? '?'}ms`,
    `attempts=${ctx.attempts ?? 1}`,
    `bucket=${ctx.bucket ?? 'n/a'}`,
    `kpi=${ctx.kpiId ?? 'n/a'}`,
    `transport=${ctx.transport ?? 'signed'}`,
    `fallback=${ctx.fallback ?? 'not-tried'}`,
    `class=${
      isHungEvidenceError(err)
        ? 'hang'
        : isNetworkBlockedEvidenceError(err)
          ? 'network-blocked'
          : isTransientEvidenceError(err)
            ? 'server-busy'
            : 'other'
    }`,
  ];
  return parts.join(' ');
}
