import { describe, it, expect } from 'vitest';
import { stageForReviewer, type StageReviewerInstance } from './stageForReviewer';

const base: StageReviewerInstance = {
  overall_status: 'pending_self',
  manager_id: 'M', skip_id: 'S', dept_head_id: 'D', bu_head_id: 'B', hr_id: 'H',
};

describe('stageForReviewer', () => {
  it('maps every pending_* status to its reviewer role', () => {
    expect(stageForReviewer({ ...base, overall_status: 'pending_manager' }, 'M')).toBe('manager');
    expect(stageForReviewer({ ...base, overall_status: 'pending_skip' }, 'S')).toBe('skip_manager');
    expect(stageForReviewer({ ...base, overall_status: 'pending_dept' }, 'D')).toBe('dept_head');
    expect(stageForReviewer({ ...base, overall_status: 'pending_bu' }, 'B')).toBe('bu_head');
    expect(stageForReviewer({ ...base, overall_status: 'pending_hr' }, 'H')).toBe('hr');
  });

  it('returns null when the uid does not match the stage slot', () => {
    expect(stageForReviewer({ ...base, overall_status: 'pending_dept' }, 'someone-else')).toBeNull();
    expect(stageForReviewer({ ...base, overall_status: 'pending_manager' }, 'D')).toBeNull();
  });

  it('returns null for terminal / self / unknown statuses', () => {
    expect(stageForReviewer({ ...base, overall_status: 'pending_self' }, 'M')).toBeNull();
    expect(stageForReviewer({ ...base, overall_status: 'completed' }, 'M')).toBeNull();
  });

  it('returns null for empty uid', () => {
    expect(stageForReviewer({ ...base, overall_status: 'pending_dept' }, null)).toBeNull();
    expect(stageForReviewer({ ...base, overall_status: 'pending_dept' }, undefined)).toBeNull();
  });
});