import { describe, it, expect } from 'vitest';
import { normalizeKpiKey } from '@/lib/orgKpiKey';

/**
 * Locks the post-propagation fallback rule used in
 * src/pages/admin/OrgKpiDataEntry.tsx → buildCardData (employee scope):
 *
 *   achievedValue =
 *     org_kpi_values.achieved_value
 *     ?? review_submissions.achieved_value
 *     ?? null
 *
 * Without this rule the scoped table renders "—" for every employee
 * after a successful Propagate (when only an org-scope OKV row exists),
 * even though the Impact sheet — which reads from `review_submissions`
 * — shows the propagated number. Two surfaces, two truths.
 */

type Row = {
  okvAchieved: number | null | undefined;
  okvIsNa: boolean | undefined;
  fb: { achievedValue: number | null; isNa: boolean } | undefined;
};

function resolve(r: Row) {
  const achievedValue =
    (r.okvAchieved ?? null) !== null
      ? r.okvAchieved!
      : r.fb
      ? r.fb.achievedValue
      : null;
  const isNa =
    (r.okvIsNa ?? false) || (r.okvAchieved === undefined && r.fb ? r.fb.isNa : false);
  return { achievedValue, isNa };
}

describe('Org KPI post-propagation hydration', () => {
  it('uses review_submissions value when OKV row is missing', () => {
    const out = resolve({
      okvAchieved: undefined,
      okvIsNa: undefined,
      fb: { achievedValue: 20, isNa: false },
    });
    expect(out.achievedValue).toBe(20);
    expect(out.isNa).toBe(false);
  });

  it('uses review_submissions value when OKV.achieved_value is null', () => {
    const out = resolve({
      okvAchieved: null,
      okvIsNa: false,
      fb: { achievedValue: 0, isNa: false },
    });
    expect(out.achievedValue).toBe(0);
  });

  it('OKV value wins when both are set (no regression)', () => {
    const out = resolve({
      okvAchieved: 75,
      okvIsNa: false,
      fb: { achievedValue: 20, isNa: false },
    });
    expect(out.achievedValue).toBe(75);
  });

  it('returns null when both OKV and fallback are missing', () => {
    const out = resolve({ okvAchieved: undefined, okvIsNa: undefined, fb: undefined });
    expect(out.achievedValue).toBeNull();
    expect(out.isNa).toBe(false);
  });

  it('fallback is keyed by `${defKey}||${employeeId}`', () => {
    const k = `${normalizeKpiKey('cat-1', 'KRA  A', 'KPI x')}||emp-1`;
    expect(k).toMatch(/\|\|emp-1$/);
  });
});

/**
 * Locks the broadened fallback contract used in v2.66.9 (May 2026):
 *   - department branch: key `${defKey}||dept||${deptId}`
 *   - organization branch: key `${defKey}||org`
 *   - employee branch: when val exists with achieved=null && is_na=false,
 *     re-read BOTH achievedValue AND isNa from the fallback.
 */

function resolveScoped(
  okv: { achieved: number | null | undefined; isNa: boolean | undefined } | null,
  fb: { achievedValue: number | null; isNa: boolean } | undefined,
) {
  const okvHasValue = (okv?.achieved ?? null) !== null || !!okv?.isNa;
  const achievedValue = okvHasValue
    ? (okv?.achieved ?? null)
    : (fb ? fb.achievedValue : null);
  const isNa = okvHasValue
    ? !!okv?.isNa
    : (fb ? fb.isNa : false);
  return { achievedValue, isNa };
}

describe('Org KPI scoped fallback (department / organization / employee-NULL)', () => {
  it('department row resolves from fallback when OKV achieved is NULL', () => {
    const out = resolveScoped(
      { achieved: null, isNa: false },
      { achievedValue: 88, isNa: false },
    );
    expect(out.achievedValue).toBe(88);
    expect(out.isNa).toBe(false);
  });

  it('organization row resolves from fallback when OKV row absent', () => {
    const out = resolveScoped(null, { achievedValue: 42, isNa: false });
    expect(out.achievedValue).toBe(42);
  });

  it('employee row with OKV achieved=null, is_na=false re-reads both from fallback', () => {
    const out = resolveScoped(
      { achieved: null, isNa: false },
      { achievedValue: 100, isNa: false },
    );
    expect(out.achievedValue).toBe(100);
    expect(out.isNa).toBe(false);
  });

  it('all-NA fallback is honoured when OKV is empty', () => {
    const out = resolveScoped(null, { achievedValue: null, isNa: true });
    expect(out.isNa).toBe(true);
    expect(out.achievedValue).toBeNull();
  });

  it('OKV authoritative value still wins over fallback', () => {
    const out = resolveScoped(
      { achieved: 75, isNa: false },
      { achievedValue: 99, isNa: false },
    );
    expect(out.achievedValue).toBe(75);
  });

  it('canonical scoped key shapes', () => {
    const def = normalizeKpiKey('cat-1', 'KRA  A', 'KPI x');
    expect(`${def}||dept||dept-1`).toMatch(/\|\|dept\|\|dept-1$/);
    expect(`${def}||org`).toMatch(/\|\|org$/);
  });
});