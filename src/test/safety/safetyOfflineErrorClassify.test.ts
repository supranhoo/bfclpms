import { describe, it, expect } from 'vitest';
import {
  classifyQueueError,
  attemptSeverity,
} from '@/lib/safetyOfflineErrorClassify';

describe('classifyQueueError', () => {
  it('returns none for un-attempted entries', () => {
    expect(classifyQueueError(null, 0).cls).toBe('none');
    expect(classifyQueueError('whatever', 0).cls).toBe('none');
  });

  it('flags conflict / idempotency hits', () => {
    expect(classifyQueueError('duplicate key value violates unique constraint', 2).cls).toBe('conflict');
    expect(classifyQueueError('409 Conflict', 1).cls).toBe('conflict');
    expect(
      classifyQueueError('client_submission_id already exists', 4).cls,
    ).toBe('conflict');
  });

  it('flags network errors', () => {
    expect(classifyQueueError('TypeError: Failed to fetch', 1).cls).toBe('network');
    expect(classifyQueueError('Network request timeout', 2).cls).toBe('network');
    expect(classifyQueueError('502 Bad Gateway', 1).cls).toBe('network');
  });

  it('flags server / RLS rejections', () => {
    expect(classifyQueueError('new row violates row-level security policy', 1).cls).toBe('server');
    expect(classifyQueueError('permission denied for table safety_incidents', 1).cls).toBe('server');
    expect(classifyQueueError('400 Bad Request', 1).cls).toBe('server');
  });

  it('falls back to unknown', () => {
    expect(classifyQueueError('something weird happened', 1).cls).toBe('unknown');
  });

  it('attempt severity buckets', () => {
    expect(attemptSeverity(0)).toBe('fresh');
    expect(attemptSeverity(2)).toBe('fresh');
    expect(attemptSeverity(3)).toBe('warning');
    expect(attemptSeverity(5)).toBe('warning');
    expect(attemptSeverity(6)).toBe('critical');
    expect(attemptSeverity(99)).toBe('critical');
  });
});