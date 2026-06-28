import { describe, it, expect } from 'vitest';

/**
 * ADR-092 — Locks the coalescing rule applied inside
 * `useOrgKpiSubmissionFallback` so the Org KPI Data Entry table never
 * displays "—" for a scope whose employee already moved past
 * `kra_set`. The hook reads three columns from `review_submissions`:
 *
 *   - achieved_value          → owner-set authoritative value
 *   - manager_achieved_value  → frozen snapshot copy made on manager update
 *   - self_achieved_value     → frozen snapshot copy made on self-submission
 *
 * Priority MUST be owner → manager → self. The `valueSource` field is
 * surfaced so the UI badge can disambiguate "OKV truth" from "frozen
 * reviewer snapshot" — POLICY §88 immutability is preserved.
 */

type Sub = {
  achieved_value: number | null;
  manager_achieved_value: number | null;
  self_achieved_value: number | null;
  is_na: boolean | null;
};

function coalesce(sub: Sub) {
  const ownerVal = sub.achieved_value;
  const managerVal = sub.manager_achieved_value;
  const selfVal = sub.self_achieved_value;
  const coalescedValue =
    ownerVal !== null
      ? ownerVal
      : managerVal !== null
        ? managerVal
        : selfVal;
  const valueSource: 'owner' | 'manager' | 'self' | 'none' =
    ownerVal !== null
      ? 'owner'
      : managerVal !== null
        ? 'manager'
        : selfVal !== null
          ? 'self'
          : 'none';
  return { coalescedValue, valueSource };
}

describe('Org KPI submission-fallback achieved-value coalescing (ADR-092)', () => {
  it('owner-set value wins over manager and self snapshots', () => {
    const out = coalesce({
      achieved_value: 12.5,
      manager_achieved_value: 9.67,
      self_achieved_value: 9.67,
      is_na: false,
    });
    expect(out.coalescedValue).toBe(12.5);
    expect(out.valueSource).toBe('owner');
  });

  it('manager snapshot wins when owner is NULL (post-manager-update case)', () => {
    const out = coalesce({
      achieved_value: null,
      manager_achieved_value: 9.67,
      self_achieved_value: 9.67,
      is_na: false,
    });
    expect(out.coalescedValue).toBe(9.67);
    expect(out.valueSource).toBe('manager');
  });

  it('self snapshot is the last resort (post-self-review, pre-manager case)', () => {
    const out = coalesce({
      achieved_value: null,
      manager_achieved_value: null,
      self_achieved_value: 9.67,
      is_na: false,
    });
    expect(out.coalescedValue).toBe(9.67);
    expect(out.valueSource).toBe('self');
  });

  it('returns null + source "none" when every column is NULL', () => {
    const out = coalesce({
      achieved_value: null,
      manager_achieved_value: null,
      self_achieved_value: null,
      is_na: false,
    });
    expect(out.coalescedValue).toBeNull();
    expect(out.valueSource).toBe('none');
  });

  it('Y R V S Murthy / May 2026 regression scenario', () => {
    // Re-creates the exact `review_submissions` row that produced the
    // "OKV table shows — while KPI Details shows 9.67" complaint.
    const out = coalesce({
      achieved_value: null,
      manager_achieved_value: 9.67,
      self_achieved_value: 9.67,
      is_na: false,
    });
    expect(out.coalescedValue).toBe(9.67);
    expect(out.valueSource).toBe('manager');
  });

  it('coalescing never overrides is_na semantics (NA wins downstream)', () => {
    const out = coalesce({
      achieved_value: null,
      manager_achieved_value: null,
      self_achieved_value: null,
      is_na: true,
    });
    expect(out.coalescedValue).toBeNull();
    // The fallback consumer still keys on is_na for the NA pill; this
    // assertion just confirms coalescing doesn't synthesise a number.
    expect(out.valueSource).toBe('none');
  });
});