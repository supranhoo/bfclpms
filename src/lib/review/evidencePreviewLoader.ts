/**
 * ADR-300 / POLICY §EVIDENCE-PREVIEW-TRANSPORT-FALLBACK.
 *
 * RCA (Ashish Kataria, 200226): the preview raced ONE 20 s timeout against the
 * whole signing retry loop, so a hung `createSignedUrl` POST killed the dialog
 * after a single attempt (`attempts=1 elapsed=20009ms status=none`) and the
 * ADR-298 backoff never ran. The authenticated object GET used by Download was
 * working for the very same object and user, but was never tried.
 *
 * This module owns the transport policy (UI stays rendering-only):
 *   1. signed URL, per-attempt timeout, bounded backoff retries;
 *   2. on hang / server pressure, fall back to the authenticated download and
 *      render from an object URL (size-capped so ADR-250's no-buffering rule
 *      still holds for large files);
 *   3. never retry a network-blocked failure — it can never succeed.
 */
import {
  EvidenceTimeoutError,
  isNetworkBlockedEvidenceError,
  normalizeEvidenceError,
  describeEvidenceFailure,
} from './evidenceError';

export const PREVIEW_TIMEOUT_MS = 20_000;
/** Per-attempt budget so retries and the fallback fit inside the overall one. */
export const SIGN_ATTEMPT_TIMEOUT_MS = 6_000;
export const SIGN_RETRY_DELAYS_MS = [400, 1200];
export const SIGNED_URL_TTL = 600;
/** ADR-250: only small files may be buffered; larger ones keep streaming. */
export const FALLBACK_MAX_BYTES = 8 * 1024 * 1024;

export type SignResult = { data: { signedUrl: string } | null; error: unknown };
export type DownloadResult = { data: Blob | null; error: unknown };

export interface EvidenceLoaderDeps {
  sign: (path: string, ttl: number) => Promise<SignResult>;
  download: (path: string) => Promise<DownloadResult>;
  createObjectUrl?: (blob: Blob) => string;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  isCancelled?: () => boolean;
}

export interface EvidenceLoadOutcome {
  url: string;
  transport: 'signed' | 'download';
  attempts: number;
  elapsedMs: number;
  isObjectUrl: boolean;
}

export class EvidenceLoadError extends Error {
  diagnostics: string;
  cause: unknown;
  constructor(message: string, diagnostics: string, cause: unknown) {
    super(message);
    this.name = 'EvidenceLoadError';
    this.diagnostics = diagnostics;
    this.cause = cause;
  }
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Reject with a hang marker if `p` does not settle within `ms`. */
export function withAttemptTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new EvidenceTimeoutError(`${'EvidenceTimeoutError'}: no response after ${ms}ms`)),
      ms,
    );
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

export async function loadEvidencePreviewUrl(
  bucket: string,
  path: string,
  deps: EvidenceLoaderDeps,
  ctx: { kpiId?: string | null } = {},
): Promise<EvidenceLoadOutcome> {
  const now = deps.now ?? (() => Date.now());
  const sleep = deps.sleep ?? defaultSleep;
  const cancelled = deps.isCancelled ?? (() => false);
  const makeUrl = deps.createObjectUrl ?? ((b: Blob) => URL.createObjectURL(b));
  const startedAt = now();
  const remaining = () => PREVIEW_TIMEOUT_MS - (now() - startedAt);

  let attempts = 0;
  let lastError: unknown = null;

  for (let i = 0; i <= SIGN_RETRY_DELAYS_MS.length; i++) {
    if (cancelled()) throw new EvidenceLoadError('cancelled', 'cancelled', null);
    const budget = Math.min(SIGN_ATTEMPT_TIMEOUT_MS, Math.max(0, remaining()));
    if (budget <= 0) break;
    attempts = i + 1;
    try {
      const res = await withAttemptTimeout(deps.sign(path, SIGNED_URL_TTL), budget);
      if (res?.data?.signedUrl) {
        return {
          url: res.data.signedUrl,
          transport: 'signed',
          attempts,
          elapsedMs: now() - startedAt,
          isObjectUrl: false,
        };
      }
      lastError = res?.error ?? null;
    } catch (e) {
      lastError = e;
    }
    // A blocked/unreachable fetch will never succeed on retry.
    if (isNetworkBlockedEvidenceError(lastError)) break;
    if (i < SIGN_RETRY_DELAYS_MS.length && remaining() > SIGN_RETRY_DELAYS_MS[i]) {
      await sleep(SIGN_RETRY_DELAYS_MS[i]);
    }
  }

  // Signing failed. The authenticated object GET is a different request and
  // routinely succeeds when signing hangs — try it before surfacing an error.
  let fallbackNote = 'not-tried';
  const canFallback =
    !isNetworkBlockedEvidenceError(lastError) && !cancelled() && remaining() > 1_000;
  if (canFallback) {
    try {
      const res = await withAttemptTimeout(deps.download(path), Math.max(0, remaining()));
      const blob = res?.data ?? null;
      if (blob && blob.size <= FALLBACK_MAX_BYTES) {
        return {
          url: makeUrl(blob),
          transport: 'download',
          attempts,
          elapsedMs: now() - startedAt,
          isObjectUrl: true,
        };
      }
      fallbackNote = blob ? 'too-large' : 'failed';
    } catch {
      fallbackNote = 'failed';
    }
  }

  const diagnostics = describeEvidenceFailure(lastError, {
    bucket,
    kpiId: ctx.kpiId ?? null,
    elapsedMs: now() - startedAt,
    attempts: attempts || 1,
    transport: 'signed',
    fallback: fallbackNote,
  });
  throw new EvidenceLoadError(normalizeEvidenceError(lastError), diagnostics, lastError);
}