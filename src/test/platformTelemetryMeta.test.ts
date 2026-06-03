import { describe, it, expect } from 'vitest';
import {
  sanitizeSearch,
  truncate,
  buildWouldDenyMetadata,
  SENSITIVE_QS_KEYS,
} from '@/lib/platformTelemetryMeta';

describe('sanitizeSearch', () => {
  it('returns empty for empty/null/undefined input', () => {
    expect(sanitizeSearch('')).toBe('');
    expect(sanitizeSearch(null)).toBe('');
    expect(sanitizeSearch(undefined)).toBe('');
    expect(sanitizeSearch('?')).toBe('');
  });

  it('passes through benign query strings unchanged', () => {
    expect(sanitizeSearch('?view=team&page=2')).toBe('?view=team&page=2');
    expect(sanitizeSearch('view=team')).toBe('?view=team');
  });

  it('redacts when any sensitive key is present', () => {
    for (const key of SENSITIVE_QS_KEYS) {
      expect(sanitizeSearch(`?${key}=abc&view=team`)).toBe('[redacted]');
    }
  });

  it('is case-insensitive on sensitive keys', () => {
    expect(sanitizeSearch('?ACCESS_TOKEN=xyz')).toBe('[redacted]');
  });
});

describe('truncate', () => {
  it('returns input under max', () => {
    expect(truncate('abc', 10)).toBe('abc');
  });
  it('cuts to max chars', () => {
    expect(truncate('a'.repeat(300), 256).length).toBe(256);
  });
  it('handles empty input', () => {
    expect(truncate('', 10)).toBe('');
  });
});

describe('buildWouldDenyMetadata', () => {
  it('builds the expected shape with observe_only mode', () => {
    const meta = buildWouldDenyMetadata({
      actionKey: 'pms.users.edit',
      clientId: 'c-1',
      pathname: '/dashboard',
      search: '?view=team',
    });
    expect(meta.pathname).toBe('/dashboard');
    expect(meta.search).toBe('?view=team');
    expect(meta.source).toBe('CanAction');
    expect(meta.mode).toBe('observe_only');
    expect(meta.client_id).toBe('c-1');
    expect(meta.action_key).toBe('pms.users.edit');
    expect(typeof meta.captured_at).toBe('string');
  });

  it('redacts sensitive search and truncates long pathnames', () => {
    const meta = buildWouldDenyMetadata({
      actionKey: 'a',
      clientId: null,
      pathname: '/x/' + 'y'.repeat(400),
      search: '?token=secret&view=team',
    });
    expect((meta.pathname as string).length).toBe(256);
    expect(meta.search).toBe('[redacted]');
  });
});