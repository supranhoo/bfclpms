import { describe, it, expect } from 'vitest';
import {
  normalizeEvidenceError,
  isTransientEvidenceError,
  isNetworkBlockedEvidenceError,
  describeEvidenceFailure,
  EVIDENCE_ACCESS_DENIED_MESSAGE,
  EVIDENCE_SERVER_BUSY_MESSAGE,
  EVIDENCE_NETWORK_BLOCKED_MESSAGE,
} from '@/lib/review/evidenceError';

// ADR-250 — transient backend pressure must not be reported as "no access".
describe('evidenceError — transient vs permission (ADR-250)', () => {
  it.each([
    { message: 'canceling statement due to statement timeout' },
    { message: 'The connection to the database timed out' },
    { name: 'AbortError', message: '' },
    { statusCode: '544' },
    { statusCode: '503' },
  ])('flags %o as transient', (err) => {
    expect(isTransientEvidenceError(err)).toBe(true);
    expect(normalizeEvidenceError(err)).toBe(EVIDENCE_SERVER_BUSY_MESSAGE);
  });

  it.each([
    { message: 'new row violates row-level security policy' },
    { message: 'Object not found', statusCode: '404' },
    { message: 'Unauthorized', statusCode: '403' },
  ])('keeps %o as an access denial', (err) => {
    expect(isTransientEvidenceError(err)).toBe(false);
    expect(normalizeEvidenceError(err)).toBe(EVIDENCE_ACCESS_DENIED_MESSAGE);
  });

  it('falls back for empty payloads', () => {
    expect(normalizeEvidenceError({})).toBe(EVIDENCE_ACCESS_DENIED_MESSAGE);
    expect(normalizeEvidenceError(null)).toBe(EVIDENCE_ACCESS_DENIED_MESSAGE);
  });
});

// ADR-298 — an unreachable/blocked fetch is not "server busy" and not retryable.
describe('evidenceError — network blocked vs server busy (ADR-298)', () => {
  it.each([
    { name: 'TypeError', message: 'Failed to fetch' },
    { message: 'NetworkError when attempting to fetch resource.' },
    { message: 'Load failed' },
    { message: 'net::ERR_BLOCKED_BY_CLIENT' },
  ])('classifies %o as network-blocked', (err) => {
    expect(isNetworkBlockedEvidenceError(err)).toBe(true);
    expect(normalizeEvidenceError(err)).toBe(EVIDENCE_NETWORK_BLOCKED_MESSAGE);
  });

  it('keeps answered-but-failing requests as server busy', () => {
    const err = { statusCode: '503', message: 'Service Unavailable' };
    expect(isNetworkBlockedEvidenceError(err)).toBe(false);
    expect(normalizeEvidenceError(err)).toBe(EVIDENCE_SERVER_BUSY_MESSAGE);
  });

  it('never classifies a denial as network-blocked', () => {
    expect(isNetworkBlockedEvidenceError({ message: 'Unauthorized', statusCode: '403' })).toBe(false);
  });

  it('produces copyable diagnostics naming the failure class', () => {
    const diag = describeEvidenceFailure(
      { name: 'TypeError', message: 'Failed to fetch' },
      { bucket: 'review-evidence', kpiId: 'kpi-1', elapsedMs: 12, attempts: 3 },
    );
    expect(diag).toContain('class=network-blocked');
    expect(diag).toContain('attempts=3');
    expect(diag).toContain('elapsed=12ms');
    expect(diag).toContain('bucket=review-evidence');
  });
});
