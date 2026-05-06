import { describe, it, expect } from 'vitest';
import { normalizeText, normalizeKpiKey } from '@/lib/orgKpiKey';

describe('orgKpiKey normalisation (ADR-054)', () => {
  const cat = 'cat-1';

  it('lowercases', () => {
    expect(normalizeText('Safety KPI')).toBe('safety kpi');
  });

  it('strips carriage returns', () => {
    expect(normalizeText('hello\r\nworld')).toBe('hello world');
  });

  it('collapses runs of whitespace to single space', () => {
    expect(normalizeText('a   b\t\tc')).toBe('a b c');
  });

  it('trims leading/trailing whitespace', () => {
    expect(normalizeText('  spaced  ')).toBe('spaced');
  });

  it('handles null/undefined safely', () => {
    expect(normalizeText(null)).toBe('');
    expect(normalizeText(undefined)).toBe('');
  });

  it('produces identical keys for whitespace/CR/case variants', () => {
    const a = normalizeKpiKey(cat, 'Safety KPI', 'Zero LTI');
    const b = normalizeKpiKey(cat, 'safety  kpi\r', '  zero lti ');
    expect(a).toBe(b);
  });

  it('treats different categories as different keys', () => {
    const a = normalizeKpiKey('cat-1', 'k', 'p');
    const b = normalizeKpiKey('cat-2', 'k', 'p');
    expect(a).not.toBe(b);
  });

  it('parity between owner-side and kpi-side normalisation (root cause regression)', () => {
    // ownership map builder used to do `replace(/\r/g,'').toLowerCase()` only,
    // while kpi-side did lowercase + whitespace-collapse. Strings with double
    // spaces produced different keys and silently failed lookups.
    const ownerKra = 'Implementation of  common - policies';
    const kpiKra = 'implementation of common - policies';
    expect(normalizeKpiKey(cat, ownerKra, 'x')).toBe(normalizeKpiKey(cat, kpiKra, 'x'));
  });
});