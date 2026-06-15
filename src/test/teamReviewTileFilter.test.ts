import { describe, it, expect } from 'vitest';
import { matchesTeamTile } from '@/lib/teamReviewTileFilter';

const SELF_L1_AUDIT = ['kra_set', 'self_review', 'manager_check', 'audit', 'approved'];
const SELF_HR_PMS    = ['kra_set', 'self_review', 'hr_pms_review', 'approved']; // no manager_check, no skip
const SELF_AUDIT_MGMT = ['kra_set', 'self_review', 'audit', 'management_review', 'approved']; // no manager_check, no skip
const FULL_8           = ['kra_set', 'self_review', 'manager_check', 'skip_level_check', 'hr_pms_review', 'audit', 'management_review', 'approved'];

describe('matchesTeamTile — stage-true tile filtering', () => {
  it('Direct Pending: admin EXCLUDES employee on self_hr_pms template (no manager_check)', () => {
    expect(matchesTeamTile('pending_direct', {
      kpiStatus: 'self_review',
      stages: SELF_HR_PMS,
      isDirect: false,
      isIndirect: false,
      isFullAccess: true,
    })).toBe(false);
  });

  it('Direct Pending: admin INCLUDES employee on self_l1_audit at self_review', () => {
    expect(matchesTeamTile('pending_direct', {
      kpiStatus: 'self_review',
      stages: SELF_L1_AUDIT,
      isDirect: false,
      isIndirect: false,
      isFullAccess: true,
    })).toBe(true);
  });

  it('Direct Pending: excludes after KPI advances to manager_check', () => {
    expect(matchesTeamTile('pending_direct', {
      kpiStatus: 'manager_check',
      stages: SELF_L1_AUDIT,
      isDirect: false,
      isIndirect: false,
      isFullAccess: true,
    })).toBe(false);
  });

  it('Direct Pending: direct manager (non-full-access) still works on legacy chain', () => {
    expect(matchesTeamTile('pending_direct', {
      kpiStatus: 'self_review',
      stages: SELF_L1_AUDIT,
      isDirect: true,
      isIndirect: false,
      isFullAccess: false,
    })).toBe(true);
  });

  it('Skip-Level Pending: HR PMS on self_audit_mgmt (no skip stage) returns false', () => {
    expect(matchesTeamTile('pending_skip', {
      kpiStatus: 'manager_check',
      stages: SELF_AUDIT_MGMT,
      isDirect: false,
      isIndirect: false,
      isFullAccess: true,
    })).toBe(false);
  });

  it('Skip-Level Pending: admin on full pipeline at manager_check returns true', () => {
    expect(matchesTeamTile('pending_skip', {
      kpiStatus: 'manager_check',
      stages: FULL_8,
      isDirect: false,
      isIndirect: false,
      isFullAccess: true,
    })).toBe(true);
  });

  it('KRA Set: admin requires employee to actually have self_review stage', () => {
    expect(matchesTeamTile('pending_kra_set', {
      kpiStatus: 'kra_set',
      stages: ['kra_set', 'approved'],
      isDirect: false,
      isIndirect: false,
      isFullAccess: true,
    })).toBe(false);
    expect(matchesTeamTile('pending_kra_set', {
      kpiStatus: 'kra_set',
      stages: SELF_L1_AUDIT,
      isDirect: false,
      isIndirect: false,
      isFullAccess: true,
    })).toBe(true);
  });

  it('Reviewed: indirect report counted only after skip stage', () => {
    expect(matchesTeamTile('reviewed', {
      kpiStatus: 'manager_check',
      stages: FULL_8,
      isDirect: false,
      isIndirect: true,
      isFullAccess: false,
    })).toBe(false);
    expect(matchesTeamTile('reviewed', {
      kpiStatus: 'skip_level_check',
      stages: FULL_8,
      isDirect: false,
      isIndirect: true,
      isFullAccess: false,
    })).toBe(true);
  });
});
