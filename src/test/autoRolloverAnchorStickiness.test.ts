/**
 * ADR-088 — regression test for `auto-rollover-kpis::buildNewKpi`.
 *
 * The edge function lives under `supabase/functions/auto-rollover-kpis` and
 * uses Deno-only imports, so we re-implement the tiny pure helpers we want
 * to lock down here and exercise the exact stickiness invariant: the per-KPI
 * `frequency_cycle_start` MUST be preserved across rollover. Synthesising
 * the Jan-anchored fallback only happens when the source has no anchor.
 */
import { describe, it, expect } from 'vitest';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'] as const;
const LONG_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'] as const;

function resolveCycleAnchorForPeriod(frequency: string | null, targetMonth: string): string | null {
  if (!frequency) return null;
  const idx = LONG_MONTHS.indexOf(targetMonth as any);
  if (idx < 0) return null;
  const len = frequency === 'Bi-Monthly' ? 2
    : frequency === 'Quarterly' ? 3
    : frequency === 'Half-Yearly' ? 6
    : frequency === 'Yearly' ? 12
    : 1;
  if (len <= 1) return null;
  if (len === 12) return 'Jan-Dec';
  const start = Math.floor(idx / len) * len;
  return `${MONTHS[start]}-${MONTHS[start + len - 1]}`;
}

/** Mirror of buildNewKpi's anchor logic (ADR-088). */
function pickAnchor(sourceAnchor: string | null, frequency: string, targetMonth: string): string | null {
  return sourceAnchor ?? resolveCycleAnchorForPeriod(frequency, targetMonth);
}

describe('ADR-088 — auto-rollover preserves source frequency_cycle_start', () => {
  it('Bi-Monthly offset Feb-Mar stays Feb-Mar when rolled into May', () => {
    expect(pickAnchor('Feb-Mar', 'Bi-Monthly', 'May')).toBe('Feb-Mar');
  });

  it('Bi-Monthly offset Feb-Mar stays Feb-Mar when rolled into June', () => {
    expect(pickAnchor('Feb-Mar', 'Bi-Monthly', 'June')).toBe('Feb-Mar');
  });

  it('Half-Yearly offset May-Oct stays May-Oct when rolled into November', () => {
    expect(pickAnchor('May-Oct', 'Half-Yearly', 'November')).toBe('May-Oct');
  });

  it('Quarterly offset Apr-Jun stays Apr-Jun when rolled into July', () => {
    expect(pickAnchor('Apr-Jun', 'Quarterly', 'July')).toBe('Apr-Jun');
  });

  it('NULL source anchor synthesises the Jan-anchored standard cycle', () => {
    expect(pickAnchor(null, 'Bi-Monthly', 'May')).toBe('May-Jun');
    expect(pickAnchor(null, 'Quarterly', 'August')).toBe('Jul-Sep');
  });

  it('Monthly / unsupported frequencies leave source anchor untouched', () => {
    expect(pickAnchor(null, 'Monthly', 'May')).toBeNull();
    expect(pickAnchor('whatever', 'Monthly', 'May')).toBe('whatever');
  });
});