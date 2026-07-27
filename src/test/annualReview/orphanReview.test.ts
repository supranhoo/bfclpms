import { describe, it, expect } from 'vitest';
import {
  findOrphanedStages, blockingOrphans, type OrphanCandidateInstance,
} from '@/lib/annualReview/orphanReview';

const ACTIVE = 'active-reviewer';
const INACTIVE = 'inactive-reviewer';
const activeById = { [ACTIVE]: true, [INACTIVE]: false };

const base: OrphanCandidateInstance = {
  id: 'i1',
  employee_id: 'emp1',
  overall_status: 'pending_bu',
  enabled_stages: ['self', 'manager', 'bu_head'],
  manager_id: ACTIVE,
  skip_id: null,
  dept_head_id: null,
  bu_head_id: ACTIVE,
  hr_id: null,
  management_id: null,
};

describe('findOrphanedStages (ADR-173)', () => {
  it('returns nothing when all enabled stages have active reviewers', () => {
    expect(findOrphanedStages(base, activeById)).toEqual([]);
  });

  it('flags an inactive reviewer on the current stage as blocking', () => {
    const rows = findOrphanedStages({ ...base, bu_head_id: INACTIVE }, activeById);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ stage: 'bu_head', reason: 'inactive_reviewer', isCurrentStage: true });
    expect(blockingOrphans(rows)).toHaveLength(1);
  });

  it('flags an unmapped reviewer on an enabled downstream stage as non-blocking', () => {
    const rows = findOrphanedStages(
      { ...base, enabled_stages: ['self', 'manager', 'hr', 'bu_head'] },
      activeById,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ stage: 'hr', reason: 'no_reviewer_mapped', isCurrentStage: false });
    expect(blockingOrphans(rows)).toHaveLength(0);
  });

  it('ignores stages that are not enabled', () => {
    const rows = findOrphanedStages({ ...base, dept_head_id: INACTIVE }, activeById);
    expect(rows).toEqual([]);
  });

  it('never flags the self stage', () => {
    const rows = findOrphanedStages(
      { ...base, enabled_stages: ['self'], overall_status: 'pending_self' },
      activeById,
    );
    expect(rows).toEqual([]);
  });

  it('excludes completed and excluded instances', () => {
    for (const s of ['completed', 'excluded'] as const) {
      expect(findOrphanedStages({ ...base, overall_status: s, bu_head_id: INACTIVE }, activeById)).toEqual([]);
    }
  });

  it('treats an unknown reviewer id as inactive', () => {
    const rows = findOrphanedStages({ ...base, bu_head_id: 'ghost' }, activeById);
    expect(rows[0]).toMatchObject({ reason: 'inactive_reviewer' });
  });
});
