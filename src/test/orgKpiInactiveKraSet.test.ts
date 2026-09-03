/**
 * ADR-349 — POLICY §ORG-KPI-ACTIVE-POPULATION.
 *
 * Regression: an Org KPI where every ACTIVE mapped employee is entered and
 * propagated, but one INACTIVE employee is still sitting at `kra_set`, was
 * rendered as `stuck` (and counted under the Pending chip). The active
 * population is the only population that may decide status.
 */
import { describe, it, expect } from 'vitest';
import {
  activeKraSetEmpIds,
  deriveOrgKpiTileStatus,
  summarisePropagationPreview,
} from '@/lib/orgKpiStatus';

// 7 active mapped employees, all propagated. `inactive-1` is NOT in the mapped
// (active) population but lingers in the kra_set set from a legacy payload.
const ACTIVE = ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7'];
const mapped = new Set(ACTIVE);
const kraSetWithInactive = new Set(['inactive-1']);

const propagatedOkvRows = (defKey: string) =>
  ACTIVE.map((id) => ({ status: 'propagated', achieved_value: 10, key: `${defKey}||null||${id}` }));

describe('activeKraSetEmpIds', () => {
  it('drops ids outside the active mapped population', () => {
    expect(Array.from(activeKraSetEmpIds(mapped, new Set(['e2', 'inactive-1'])))).toEqual(['e2']);
  });

  it('is a no-op when the mapped population is unknown (empty)', () => {
    expect(activeKraSetEmpIds(new Set(), new Set(['x']))).toEqual(new Set(['x']));
  });
});

describe('tile status ignores inactive kra_set employees', () => {
  it('employee scope → propagated, not stuck', () => {
    expect(
      deriveOrgKpiTileStatus({
        scope: 'employee',
        okvRows: propagatedOkvRows('k'),
        mappedEmpIds: mapped,
        kraSetEmpIds: kraSetWithInactive,
      }),
    ).toBe('propagated');
  });

  it('department scope → propagated, not stuck', () => {
    expect(
      deriveOrgKpiTileStatus({
        scope: 'department',
        okvRows: [{ status: 'propagated', achieved_value: 5, key: 'k||d1||null' }],
        mappedEmpIds: mapped,
        kraSetEmpIds: kraSetWithInactive,
        empToDept: new Map([['inactive-1', 'd1']]),
      }),
    ).toBe('propagated');
  });

  it('organization scope → propagated, not stuck', () => {
    expect(
      deriveOrgKpiTileStatus({
        scope: 'organization',
        okvRows: [{ status: 'propagated', achieved_value: 5, key: 'k||null||null' }],
        mappedEmpIds: mapped,
        kraSetEmpIds: kraSetWithInactive,
      }),
    ).toBe('propagated');
  });

  it('an ACTIVE employee still at kra_set is still genuinely stuck', () => {
    expect(
      deriveOrgKpiTileStatus({
        scope: 'employee',
        okvRows: propagatedOkvRows('k'),
        mappedEmpIds: mapped,
        kraSetEmpIds: new Set(['e3', 'inactive-1']),
      }),
    ).toBe('stuck');
  });
});

describe('propagation preview treats employee_inactive as benign', () => {
  it('all-inactive skips read as effectively propagated', () => {
    const v = summarisePropagationPreview([
      { will_advance: false, reason: 'employee_inactive' },
      { will_advance: false, reason: 'not_in_kra_set' },
    ]);
    expect(v.willAdvance).toBe(0);
    expect(v.effectivelyPropagated).toBe(true);
  });
});

describe('Pending chip arithmetic (ADR-349)', () => {
  // Mirror of the page: Pending must be counted explicitly, never derived as
  // total - entered - propagated (which folded `stuck` into Pending).
  const statuses = ['propagated', 'entered', 'stuck', 'pending'] as const;
  it('a stuck KPI is not counted as pending', () => {
    const pending = statuses.filter((s) => s === 'pending').length;
    const derived = statuses.length
      - statuses.filter((s) => s === 'entered').length
      - statuses.filter((s) => s === 'propagated').length;
    expect(pending).toBe(1);
    expect(derived).toBe(2); // the old, wrong number
  });
});
