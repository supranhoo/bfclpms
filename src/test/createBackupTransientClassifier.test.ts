import { describe, it, expect } from 'vitest';
import { isTransientChunkError } from '../../supabase/functions/create-backup/index.ts';

// Phase 9.2.c — RCA of 2026-06-11 scheduled-backup failure.
// Three back-to-back batches died with HTTP 502 Bad Gateway and were
// classified non-transient, losing 12 tables and tripping hard-fail.
// The classifier must now treat upstream gateway transients as retryable
// while preserving the existing 546 / 429 / RateLimit branches and still
// rejecting genuinely non-transient errors.
describe('isTransientChunkError', () => {
  it('keeps existing transient classes (regression lock for I9)', () => {
    expect(isTransientChunkError('HTTP 546')).toBe(true);
    expect(isTransientChunkError('HTTP 429')).toBe(true);
    expect(isTransientChunkError('RateLimitError: trace abc retry after 500ms')).toBe(true);
    expect(isTransientChunkError('anything', true)).toBe(true);
  });

  it('classifies upstream gateway 5xx + 408 as transient (new)', () => {
    expect(isTransientChunkError('Batch failed: HTTP 502 Bad Gateway')).toBe(true);
    expect(isTransientChunkError('Batch failed: HTTP 503 Service Unavailable')).toBe(true);
    expect(isTransientChunkError('Batch failed: HTTP 504 Gateway Timeout')).toBe(true);
    expect(isTransientChunkError('Batch failed: HTTP 408 Request Timeout')).toBe(true);
  });

  it('classifies network-layer errors as transient (new)', () => {
    expect(isTransientChunkError('TypeError: fetch failed')).toBe(true);
    expect(isTransientChunkError('Error: ECONNRESET')).toBe(true);
    expect(isTransientChunkError('Error: ETIMEDOUT')).toBe(true);
    expect(isTransientChunkError('socket hang up')).toBe(true);
  });

  it('still rejects schema / permission / non-retryable 5xx', () => {
    expect(isTransientChunkError('HTTP 500 Internal Server Error')).toBe(false);
    expect(isTransientChunkError('HTTP 501 Not Implemented')).toBe(false);
    expect(isTransientChunkError('permission denied for table x')).toBe(false);
    expect(isTransientChunkError('relation "x" does not exist')).toBe(false);
    expect(isTransientChunkError('new row violates row-level security policy')).toBe(false);
    expect(isTransientChunkError(undefined)).toBe(false);
    expect(isTransientChunkError('')).toBe(false);
  });
});