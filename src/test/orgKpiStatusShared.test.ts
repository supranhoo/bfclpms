import { describe, it, expect } from 'vitest';
import {
  deriveOrgKpiTileStatus,
  summarisePropagationPreview,
  isAlreadyAdvancedPastKraSet,
} from '@/lib/orgKpiStatus';

describe('deriveOrgKpiTileStatus (ADR-056 shared helper)', () => {
  it('no OKV → pending', () => {
    expect(deriveOrgKpiTileStatus({
      scope: 'employee',
      okvRows: [],
      mappedEmpIds: new Set(['e1']),
      kraSetEmpIds: new Set(['e1']),
    })).toBe('pending');
  });

  it('organization scope: OKV draft + every child advanced → propagated (Budget saving)', () => {
    expect(deriveOrgKpiTileStatus({
      scope: 'organization',
      okvRows: [{ status: 'draft', achieved_value: 100, key: 'k||null||null' }],
      mappedEmpIds: new Set(['e1']),
      kraSetEmpIds: new Set(),
    })).toBe('propagated');
  });

  it('organization scope: OKV draft + child still kra_set → entered', () => {
    expect(deriveOrgKpiTileStatus({
      scope: 'organization',
      okvRows: [{ status: 'draft', achieved_value: 100, key: 'k||null||null' }],
      mappedEmpIds: new Set(['e1', 'e2']),
      kraSetEmpIds: new Set(['e1']),
    })).toBe('entered');
  });

  it('organization scope: OKV propagated + kra_set child → stuck', () => {
    expect(deriveOrgKpiTileStatus({
      scope: 'organization',
      okvRows: [{ status: 'propagated', achieved_value: 100, key: 'k||null||null' }],
      mappedEmpIds: new Set(['e1']),
      kraSetEmpIds: new Set(['e1']),
    })).toBe('stuck');
  });

  it('employee scope: OKV sent_back + every child advanced → propagated', () => {
    expect(deriveOrgKpiTileStatus({
      scope: 'employee',
      okvRows: [{ status: 'sent_back', achieved_value: 50, key: 'k||null||e1' }],
      mappedEmpIds: new Set(['e1']),
      kraSetEmpIds: new Set(),
    })).toBe('propagated');
  });

  it('employee scope: OKV propagated, mixed kra_set → stuck only when matched empId is in kra_set', () => {
    expect(deriveOrgKpiTileStatus({
      scope: 'employee',
      okvRows: [{ status: 'propagated', achieved_value: 50, key: 'k||null||e1' }],
      mappedEmpIds: new Set(['e1', 'e2']),
      kraSetEmpIds: new Set(['e1']),
    })).toBe('stuck');
    expect(deriveOrgKpiTileStatus({
      scope: 'employee',
      okvRows: [{ status: 'propagated', achieved_value: 50, key: 'k||null||e1' }],
      mappedEmpIds: new Set(['e1', 'e2']),
      kraSetEmpIds: new Set(['e2']),
    })).toBe('propagated');
  });

  it('department scope: stuck only when kra_set employee belongs to a propagated dept', () => {
    expect(deriveOrgKpiTileStatus({
      scope: 'department',
      okvRows: [{ status: 'propagated', achieved_value: 50, key: 'k||d1||null' }],
      mappedEmpIds: new Set(['e1', 'e2']),
      kraSetEmpIds: new Set(['e1']),
      empToDept: new Map([['e1', 'd1'], ['e2', 'd2']]),
    })).toBe('stuck');
    expect(deriveOrgKpiTileStatus({
      scope: 'department',
      okvRows: [{ status: 'propagated', achieved_value: 50, key: 'k||d1||null' }],
      mappedEmpIds: new Set(['e1', 'e2']),
      kraSetEmpIds: new Set(['e2']),
      empToDept: new Map([['e1', 'd1'], ['e2', 'd2']]),
    })).toBe('propagated');
  });

  it('isAlreadyAdvancedPastKraSet: empty mapped → false', () => {
    expect(isAlreadyAdvancedPastKraSet(new Set(), new Set())).toBe(false);
  });
});

describe('summarisePropagationPreview (ADR-056 shared helper)', () => {
  it('all eligible → not effectivelyPropagated', () => {
    const v = summarisePropagationPreview([
      { will_advance: true, reason: 'eligible' },
      { will_advance: true, reason: 'eligible', value_changes: true, current_self_score: 3 },
    ]);
    expect(v.willAdvance).toBe(2);
    expect(v.overwriteCount).toBe(1);
    expect(v.effectivelyPropagated).toBe(false);
  });

  it('all reviewer-locked → effectivelyPropagated', () => {
    const v = summarisePropagationPreview([
      { will_advance: false, reason: 'reviewer_locked' },
      { will_advance: false, reason: 'not_in_kra_set' },
    ]);
    expect(v.willAdvance).toBe(0);
    expect(v.lockedCount).toBe(1);
    expect(v.effectivelyPropagated).toBe(true);
  });

  it('mixed eligible + locked → not effectivelyPropagated', () => {
    const v = summarisePropagationPreview([
      { will_advance: true, reason: 'eligible' },
      { will_advance: false, reason: 'reviewer_locked' },
    ]);
    expect(v.willAdvance).toBe(1);
    expect(v.willSkip).toBe(1);
    expect(v.effectivelyPropagated).toBe(false);
  });

  it('skip with unknown reason → not effectivelyPropagated (safety)', () => {
    const v = summarisePropagationPreview([
      { will_advance: false, reason: 'kpi_not_found' },
    ]);
    expect(v.effectivelyPropagated).toBe(false);
  });

  it('empty rows → all zeros, not effectivelyPropagated', () => {
    const v = summarisePropagationPreview([]);
    expect(v.total).toBe(0);
    expect(v.effectivelyPropagated).toBe(false);
  });
});
