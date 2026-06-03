import { describe, it, expect } from 'vitest';
import {
  bucketByDay,
  aggregateByPathname,
  presetRange,
  defaultFilters,
} from '@/lib/platformTelemetryAgg';

describe('bucketByDay', () => {
  it('zero-fills missing days', () => {
    const out = bucketByDay([], '2026-06-01', '2026-06-03');
    expect(out.map((b) => b.date)).toEqual(['2026-06-01', '2026-06-02', '2026-06-03']);
    expect(out.every((b) => b.count === 0)).toBe(true);
  });
  it('counts rows into the right bucket', () => {
    const rows = [
      { created_at: '2026-06-01T05:00:00Z' },
      { created_at: '2026-06-01T20:00:00Z' },
      { created_at: '2026-06-03T00:00:01Z' },
      { created_at: '2026-05-30T00:00:00Z' }, // out of range
    ];
    const out = bucketByDay(rows, '2026-06-01', '2026-06-03');
    expect(out.find((b) => b.date === '2026-06-01')?.count).toBe(2);
    expect(out.find((b) => b.date === '2026-06-02')?.count).toBe(0);
    expect(out.find((b) => b.date === '2026-06-03')?.count).toBe(1);
  });
});

describe('aggregateByPathname', () => {
  it('labels null/blank pathnames as Not captured', () => {
    const out = aggregateByPathname([
      { after: { pathname: '/a' } },
      { after: { pathname: '/a' } },
      { after: { pathname: '' } },
      { after: null },
      { after: { pathname: '/b' } },
    ]);
    expect(out[0]).toEqual({ key: '/a', count: 2 });
    const nc = out.find((r) => r.key === 'Not captured');
    expect(nc?.count).toBe(2);
    expect(out.find((r) => r.key === '/b')?.count).toBe(1);
  });
});

describe('presetRange', () => {
  const now = new Date('2026-06-15T10:00:00');
  it('today returns same from/until', () => {
    const r = presetRange('today', now);
    expect(r.from).toBe(r.until);
  });
  it('last7 spans 7 days inclusive', () => {
    const r = presetRange('last7', now);
    expect(r.until).toBe('2026-06-15');
    expect(r.from).toBe('2026-06-09');
  });
  it('last30 spans 30 days inclusive', () => {
    const r = presetRange('last30', now);
    expect(r.until).toBe('2026-06-15');
    expect(r.from).toBe('2026-05-17');
  });
});

describe('defaultFilters', () => {
  it('resets every filter to its blank/default value', () => {
    const f = defaultFilters(new Date('2026-06-15T10:00:00'));
    expect(f.clientId).toBe('all');
    expect(f.moduleKey).toBe('all');
    expect(f.risk).toBe('all');
    expect(f.actionSearch).toBe('');
    expect(f.userSearch).toBe('');
    expect(f.routeFilter).toBe('');
    expect(f.until).toBe('2026-06-15');
    expect(f.from).toBe('2026-05-17');
  });
});