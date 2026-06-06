import { describe, it, expect } from 'vitest';
import {
  ALL_VIEWER_STAGES,
  allowedViewerStages,
  clampViewerStage,
} from '@/lib/bulkReviewerStages';

describe('Bulk Review — viewer-stage visibility by role', () => {
  it('admin sees every stage', () => {
    expect(allowedViewerStages('admin', false)).toEqual(ALL_VIEWER_STAGES);
    expect(allowedViewerStages('admin', true)).toEqual(ALL_VIEWER_STAGES);
  });

  it.each([
    ['skip_level',  'skip_level'],
    ['hr_pms',      'hr_pms'],
    ['auditor',     'auditor'],
    ['management',  'management'],
  ])('role %s sees exactly one stage (%s)', (role, stage) => {
    const opts = allowedViewerStages(role, false);
    expect(opts.map(o => o.value)).toEqual([stage]);
  });

  it('plain manager sees only Manager', () => {
    expect(allowedViewerStages('manager', false).map(o => o.value))
      .toEqual(['manager']);
  });

  it('manager who is also a functional manager sees both stages', () => {
    expect(allowedViewerStages('manager', true).map(o => o.value))
      .toEqual(['manager', 'functional_manager']);
  });

  it('unknown / employee role sees no stages', () => {
    expect(allowedViewerStages('employee', false)).toEqual([]);
    expect(allowedViewerStages(null, false)).toEqual([]);
    expect(allowedViewerStages(undefined, true)).toEqual([]);
  });

  describe('clampViewerStage', () => {
    it('keeps the requested value when allowed', () => {
      const opts = allowedViewerStages('admin', false);
      expect(clampViewerStage('hr_pms', opts)).toBe('hr_pms');
    });

    it('falls back to the first allowed value when requested is not allowed', () => {
      const opts = allowedViewerStages('auditor', false);
      expect(clampViewerStage('manager', opts)).toBe('auditor');
    });

    it('returns null when no stages are allowed', () => {
      expect(clampViewerStage('manager', [])).toBeNull();
    });
  });
});