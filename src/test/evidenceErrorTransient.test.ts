import { describe, it, expect } from 'vitest';
import {
  normalizeEvidenceError,
  isTransientEvidenceError,
  EVIDENCE_ACCESS_DENIED_MESSAGE,
  EVIDENCE_SERVER_BUSY_MESSAGE,
} from '@/lib/review/evidenceError';

// ADR-250 — transient backend pressure must not be reported as "no access".
describe('evidenceError — transient vs permission (ADR-250)', () => {
  it.each([
    { message: 'canceling statement due to statement timeout' },
    { message: 'The connection to the database timed out' },
    { name: 'AbortError', message: '' },
    { message: 'Failed to fetch' },
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
