/**
 * ADR-300 — evidence preview transport fallback.
 *
 * Regression guards for the Ashish Kataria (200226) outage: a hung
 * `createSignedUrl` killed the preview after ONE attempt at the 20s guard, was
 * reported as "server busy", and the working authenticated download for the
 * same object was never tried.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  loadEvidencePreviewUrl,
  EvidenceLoadError,
  SIGN_RETRY_DELAYS_MS,
  FALLBACK_MAX_BYTES,
} from '@/lib/review/evidencePreviewLoader';
import {
  EVIDENCE_HUNG_MESSAGE,
  EVIDENCE_SERVER_BUSY_MESSAGE,
  EVIDENCE_NETWORK_BLOCKED_MESSAGE,
  isHungEvidenceError,
  EvidenceTimeoutError,
  normalizeEvidenceError,
  describeEvidenceFailure,
} from '@/lib/review/evidenceError';

const blob = (size: number) => ({ size }) as unknown as Blob;
const deps = (over: Partial<Parameters<typeof loadEvidencePreviewUrl>[2]>) => ({
  sign: vi.fn(async () => ({ data: { signedUrl: 'https://signed/ok' }, error: null })),
  download: vi.fn(async () => ({ data: blob(16_000), error: null })),
  createObjectUrl: () => 'blob:fallback',
  sleep: async () => {},
  ...over,
});

describe('loadEvidencePreviewUrl (ADR-300)', () => {
  it('uses the signed URL on the happy path without touching download', async () => {
    const d = deps({});
    const out = await loadEvidencePreviewUrl('review-evidence', 'a/b.jpg', d);
    expect(out).toMatchObject({ url: 'https://signed/ok', transport: 'signed', attempts: 1 });
    expect(d.download).not.toHaveBeenCalled();
  });

  it('retries signing with backoff instead of dying on the first failure', async () => {
    const sign = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { statusCode: '503' } })
      .mockResolvedValueOnce({ data: { signedUrl: 'https://signed/second' }, error: null });
    const out = await loadEvidencePreviewUrl('review-evidence', 'a/b.jpg', deps({ sign }));
    expect(out.transport).toBe('signed');
    expect(out.attempts).toBe(2);
    expect(sign).toHaveBeenCalledTimes(2);
  });

  it('falls back to the authenticated download when signing hangs', async () => {
    // never settles — reproduces the reported 20s hang
    const sign = vi.fn(() => new Promise<never>(() => {}));
    let t = 0;
    const out = await loadEvidencePreviewUrl(
      'review-evidence',
      'kpi/331c01ff/photo.jpg',
      deps({ sign, attemptTimeoutMs: 20, now: () => (t += 1_000) }),
    );
    expect(out.transport).toBe('download');
    expect(out.url).toBe('blob:fallback');
    expect(sign.mock.calls.length).toBeGreaterThan(1);
  });

  it('never retries or falls back on a network-blocked failure', async () => {
    const sign = vi.fn(async () => ({
      data: null,
      error: { name: 'TypeError', message: 'Failed to fetch' },
    }));
    const d = deps({ sign });
    await expect(loadEvidencePreviewUrl('review-evidence', 'a/b.jpg', d)).rejects.toThrow(
      EVIDENCE_NETWORK_BLOCKED_MESSAGE,
    );
    expect(sign).toHaveBeenCalledTimes(1);
    expect(d.download).not.toHaveBeenCalled();
  });

  it('does not buffer oversized files (ADR-250) and reports it in diagnostics', async () => {
    const sign = vi.fn(async () => ({ data: null, error: { statusCode: '503' } }));
    const download = vi.fn(async () => ({ data: blob(FALLBACK_MAX_BYTES + 1), error: null }));
    const err = await loadEvidencePreviewUrl(
      'review-evidence',
      'a/b.jpg',
      deps({ sign, download }),
    ).catch((e) => e as EvidenceLoadError);
    expect(err).toBeInstanceOf(EvidenceLoadError);
    expect((err as EvidenceLoadError).message).toBe(EVIDENCE_SERVER_BUSY_MESSAGE);
    expect((err as EvidenceLoadError).diagnostics).toContain('fallback=too-large');
  });

  it('reports attempts>1 and the fallback outcome in the diagnostics line', async () => {
    const sign = vi.fn(async () => ({ data: null, error: { statusCode: '500' } }));
    const download = vi.fn(async () => ({ data: null, error: { statusCode: '500' } }));
    const err = (await loadEvidencePreviewUrl(
      'review-evidence',
      'a/b.jpg',
      deps({ sign, download }),
    ).catch((e) => e)) as EvidenceLoadError;
    expect(err.diagnostics).toContain(`attempts=${SIGN_RETRY_DELAYS_MS.length + 1}`);
    expect(err.diagnostics).toContain('fallback=failed');
  });
});

describe('hang classification (ADR-300)', () => {
  it('classifies our own timeout as a hang, not server-busy', () => {
    const err = new EvidenceTimeoutError('EvidenceTimeoutError: no response after 6000ms');
    expect(isHungEvidenceError(err)).toBe(true);
    expect(normalizeEvidenceError(err)).toBe(EVIDENCE_HUNG_MESSAGE);
    expect(describeEvidenceFailure(err, { attempts: 3 })).toContain('class=hang');
  });

  it('leaves answered failures untouched', () => {
    expect(isHungEvidenceError({ statusCode: '503', message: 'timeout' })).toBe(false);
    expect(normalizeEvidenceError({ statusCode: '503' })).toBe(EVIDENCE_SERVER_BUSY_MESSAGE);
  });
});