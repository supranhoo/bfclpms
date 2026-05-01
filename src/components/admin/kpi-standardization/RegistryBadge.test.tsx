import { describe, it, expect } from 'vitest';
import { signatureKey } from '@/lib/canonicalGrouping';
import { isCanonicalEnforcementPeriod } from '@/lib/canonicalEnforcementPeriod';

/**
 * Phase 3a: Lightweight contract tests for RegistryBadge logic.
 *
 * We don't exercise the full React component (would need a QueryClient
 * provider + DOM renderer). Instead we lock the two pure rules that
 * govern its visibility and labeling:
 *  1. The badge must hide whenever the period is outside enforcement scope.
 *  2. Match lookup must use the same `signatureKey()` the resolver writes.
 */
describe('RegistryBadge — visibility rules', () => {
  it('hides for pre-May-2026 periods', () => {
    expect(isCanonicalEnforcementPeriod('April', 2026)).toBe(false);
    expect(isCanonicalEnforcementPeriod('December', 2025)).toBe(false);
  });

  it('shows from May 2026 onward', () => {
    expect(isCanonicalEnforcementPeriod('May', 2026)).toBe(true);
    expect(isCanonicalEnforcementPeriod('January', 2027)).toBe(true);
  });

  it('hides on null period or year (e.g. data-repair flows)', () => {
    expect(isCanonicalEnforcementPeriod(null, 2026)).toBe(false);
    expect(isCanonicalEnforcementPeriod('May', null)).toBe(false);
  });
});

describe('RegistryBadge — signature lookup', () => {
  it('normalizes whitespace and case so resolver hits and badge agree', () => {
    const key1 = signatureKey({
      category_id: 'c1', kra_name: '  Safety  ', kpi_name: 'Lost Time Injury',
    });
    const key2 = signatureKey({
      category_id: 'c1', kra_name: 'safety', kpi_name: 'lost time injury',
    });
    expect(key1).toBe(key2);
  });

  it('different categories never collide even with identical names', () => {
    const a = signatureKey({ category_id: 'c1', kra_name: 'X', kpi_name: 'Y' });
    const b = signatureKey({ category_id: 'c2', kra_name: 'X', kpi_name: 'Y' });
    expect(a).not.toBe(b);
  });
});