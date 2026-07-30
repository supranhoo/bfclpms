import { describe, it, expect } from 'vitest';
import { resolveReviewerRelationship } from '@/lib/review/resolveReviewerRelationship';
import { matchesTeamTile } from '@/lib/teamReviewTileFilter';
import { resolveReviewableStatuses } from '@/lib/workflowEngine';

/**
 * ADR-206 / POLICY §WF-FM-RELATIONSHIP-SSOT
 * Real-world fixture: Brundaban Chandra Das (102028)
 *  - reporting_manager_id = Sajid Raza
 *  - functional_manager_id = V.A.V.S.S. Ganapathi Varma (viewer)
 *  - June 2026 KPIs sitting at `manager_check`
 */
const VIEWER = 'ganapathi-uuid';
const MANAGER = 'sajid-uuid';
const GRAND = 'gaurav-uuid';

const EMP = {
  id: 'brundaban-uuid',
  reporting_manager_id: MANAGER,
  functional_manager_id: VIEWER,
};

const WF = ['kra_set', 'self_review', 'manager_check', 'functional_manager_check', 'audit', 'approved'];

describe('resolveReviewerRelationship', () => {
  it('trusts a server-tagged relationship', () => {
    expect(resolveReviewerRelationship({ viewerId: VIEWER, employee: { ...EMP, relationship: 'functional' } })).toBe('functional');
  });

  it('tags direct reports', () => {
    expect(resolveReviewerRelationship({ viewerId: MANAGER, employee: EMP })).toBe('direct');
  });

  it('tags skip-level reports via managersManagerId', () => {
    expect(resolveReviewerRelationship({ viewerId: GRAND, employee: EMP, managersManagerId: GRAND })).toBe('indirect');
  });

  it('tags functional reports (102028 / Ganapathi) instead of defaulting to direct', () => {
    expect(resolveReviewerRelationship({ viewerId: VIEWER, employee: EMP })).toBe('functional');
  });

  it('resolves functional from the full-access id set when the field is absent', () => {
    expect(
      resolveReviewerRelationship({
        viewerId: VIEWER,
        employee: { id: EMP.id, reporting_manager_id: MANAGER },
        functionalIds: new Set([EMP.id]),
      }),
    ).toBe('functional');
  });

  it('prefers direct over functional when the viewer is both', () => {
    expect(
      resolveReviewerRelationship({ viewerId: VIEWER, employee: { ...EMP, reporting_manager_id: VIEWER } }),
    ).toBe('direct');
  });

  it('returns other for an unrelated employee (no silent direct default)', () => {
    expect(resolveReviewerRelationship({ viewerId: 'someone-else', employee: EMP })).toBe('other');
  });
});

describe('Functional Pending tile (stage-true)', () => {
  const base = { stages: WF, isDirect: false, isIndirect: false, isFullAccess: false };

  it('surfaces a KPI at manager_check for the mapped FM', () => {
    expect(matchesTeamTile('pending_functional', { ...base, kpiStatus: 'manager_check', isFunctional: true })).toBe(true);
  });

  it('does not surface for a non-FM viewer', () => {
    expect(matchesTeamTile('pending_functional', { ...base, kpiStatus: 'manager_check', isFunctional: false })).toBe(false);
  });

  it('never surfaces when the workflow has no FM stage', () => {
    expect(
      matchesTeamTile('pending_functional', {
        ...base,
        stages: ['kra_set', 'self_review', 'manager_check', 'approved'],
        kpiStatus: 'manager_check',
        isFunctional: true,
      }),
    ).toBe(false);
  });

  it('counts an FM-passed KPI as reviewed', () => {
    expect(matchesTeamTile('reviewed', { ...base, kpiStatus: 'audit', isFunctional: true })).toBe(true);
  });
});

describe('FM reviewable status (engine parity)', () => {
  it('resolves manager_check as the FM-actionable status', () => {
    expect(resolveReviewableStatuses('functional_manager', WF)).toContain('manager_check');
  });
});
