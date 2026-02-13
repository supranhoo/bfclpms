import { describe, it, expect } from 'vitest';
import {
  resolveNextStatus,
  resolvePreviousStatus,
  resolveSendBackTargets,
  resolveSendBackStatus,
  resolvePendingStatuses,
  resolveForwardStatus,
  resolveReviewableStatuses,
  getVisibleJourneyStages,
  canReviewKpi,
  hasStage,
  DEFAULT_WORKFLOW_STAGES,
} from './workflowEngine';

const SKIP_MANAGER_STAGES = ['kra_set', 'self_review', 'audit', 'management_review', 'approved'];
const EIGHT_STAGE_PIPELINE = ['kra_set', 'self_review', 'manager_check', 'skip_level_check', 'hr_pms_review', 'audit', 'management_review', 'approved'];

describe('workflowEngine', () => {
  describe('resolveNextStatus', () => {
    it('returns next status in full pipeline', () => {
      expect(resolveNextStatus('self_review')).toBe('manager_check');
      expect(resolveNextStatus('manager_check')).toBe('audit');
    });

    it('returns next status in skip_manager pipeline', () => {
      expect(resolveNextStatus('self_review', SKIP_MANAGER_STAGES)).toBe('audit');
    });

    it('returns null at end', () => {
      expect(resolveNextStatus('approved')).toBeNull();
    });

    it('returns next status in 8-stage pipeline', () => {
      expect(resolveNextStatus('manager_check', EIGHT_STAGE_PIPELINE)).toBe('skip_level_check');
      expect(resolveNextStatus('skip_level_check', EIGHT_STAGE_PIPELINE)).toBe('hr_pms_review');
      expect(resolveNextStatus('hr_pms_review', EIGHT_STAGE_PIPELINE)).toBe('audit');
    });
  });

  describe('resolveSendBackTargets', () => {
    it('auditor has manager target in full pipeline', () => {
      const targets = resolveSendBackTargets('auditor');
      expect(targets.some(t => t.value === 'manager')).toBe(true);
    });

    it('auditor has NO manager target in skip_manager pipeline', () => {
      const targets = resolveSendBackTargets('auditor', SKIP_MANAGER_STAGES);
      expect(targets.some(t => t.value === 'manager')).toBe(false);
      expect(targets.some(t => t.value === 'employee')).toBe(true);
    });

    it('management excludes manager in skip_manager pipeline', () => {
      const targets = resolveSendBackTargets('management', SKIP_MANAGER_STAGES);
      expect(targets.some(t => t.value === 'manager')).toBe(false);
    });

    it('auditor has all targets in 8-stage pipeline', () => {
      const targets = resolveSendBackTargets('auditor', EIGHT_STAGE_PIPELINE);
      expect(targets.some(t => t.value === 'hr_pms')).toBe(true);
      expect(targets.some(t => t.value === 'skip_level')).toBe(true);
      expect(targets.some(t => t.value === 'manager')).toBe(true);
      expect(targets.some(t => t.value === 'employee')).toBe(true);
    });
  });

  describe('resolvePendingStatuses', () => {
    it('auditor includes self_review when manager skipped', () => {
      const statuses = resolvePendingStatuses('auditor', SKIP_MANAGER_STAGES);
      expect(statuses).toContain('self_review');
    });

    it('auditor uses manager_check in full pipeline', () => {
      const statuses = resolvePendingStatuses('auditor');
      expect(statuses).toContain('manager_check');
    });

    it('skip_level sees manager_check (preceding stage) in 8-stage', () => {
      const statuses = resolvePendingStatuses('skip_level', EIGHT_STAGE_PIPELINE);
      expect(statuses).toEqual(['manager_check']);
    });

    it('hr_pms sees skip_level_check (preceding stage) in 8-stage', () => {
      const statuses = resolvePendingStatuses('hr_pms', EIGHT_STAGE_PIPELINE);
      expect(statuses).toEqual(['skip_level_check']);
    });

    it('auditor sees hr_pms_review (preceding stage) in 8-stage', () => {
      const statuses = resolvePendingStatuses('auditor', EIGHT_STAGE_PIPELINE);
      expect(statuses).toContain('hr_pms_review');
      expect(statuses).toContain('audit');
    });
  });

  describe('resolveForwardStatus', () => {
    it('skip_level forwards to skip_level_check', () => {
      expect(resolveForwardStatus('skip_level', EIGHT_STAGE_PIPELINE)).toBe('skip_level_check');
    });

    it('hr_pms forwards to hr_pms_review', () => {
      expect(resolveForwardStatus('hr_pms', EIGHT_STAGE_PIPELINE)).toBe('hr_pms_review');
    });

    it('auditor forwards to management_review', () => {
      expect(resolveForwardStatus('auditor', EIGHT_STAGE_PIPELINE)).toBe('management_review');
    });
  });

  describe('resolveReviewableStatuses', () => {
    it('auditor can review self_review in skip_manager', () => {
      const statuses = resolveReviewableStatuses('auditor', SKIP_MANAGER_STAGES);
      expect(statuses).toContain('self_review');
    });

    it('skip_level can review manager_check in 8-stage', () => {
      const statuses = resolveReviewableStatuses('skip_level', EIGHT_STAGE_PIPELINE);
      expect(statuses).toEqual(['manager_check']);
    });

    it('hr_pms can review skip_level_check in 8-stage', () => {
      const statuses = resolveReviewableStatuses('hr_pms', EIGHT_STAGE_PIPELINE);
      expect(statuses).toEqual(['skip_level_check']);
    });

    it('auditor can review hr_pms_review in 8-stage', () => {
      const statuses = resolveReviewableStatuses('auditor', EIGHT_STAGE_PIPELINE);
      expect(statuses).toContain('hr_pms_review');
    });
  });

  describe('getVisibleJourneyStages', () => {
    it('full pipeline shows all 4 journey stages', () => {
      expect(getVisibleJourneyStages()).toEqual(['self', 'manager', 'auditor', 'management']);
    });

    it('skip_manager shows 3 journey stages', () => {
      expect(getVisibleJourneyStages(SKIP_MANAGER_STAGES)).toEqual(['self', 'auditor', 'management']);
    });

    it('8-stage shows all 6 journey stages', () => {
      expect(getVisibleJourneyStages(EIGHT_STAGE_PIPELINE)).toEqual([
        'self', 'manager', 'skip_level', 'hr_pms', 'auditor', 'management'
      ]);
    });
  });

  describe('canReviewKpi', () => {
    it('audit can review self_review when manager skipped', () => {
      expect(canReviewKpi('self_review', 'audit', SKIP_MANAGER_STAGES)).toBe(true);
    });

    it('audit cannot review self_review in full pipeline', () => {
      expect(canReviewKpi('self_review', 'audit')).toBe(false);
    });

    it('skip-level-review can review manager_check in 8-stage', () => {
      expect(canReviewKpi('manager_check', 'skip-level-review', EIGHT_STAGE_PIPELINE)).toBe(true);
    });

    it('skip-level-review cannot review skip_level_check', () => {
      expect(canReviewKpi('skip_level_check', 'skip-level-review', EIGHT_STAGE_PIPELINE)).toBe(false);
    });

    it('hr-pms-review can review skip_level_check in 8-stage', () => {
      expect(canReviewKpi('skip_level_check', 'hr-pms-review', EIGHT_STAGE_PIPELINE)).toBe(true);
    });

    it('audit can review hr_pms_review in 8-stage', () => {
      expect(canReviewKpi('hr_pms_review', 'audit', EIGHT_STAGE_PIPELINE)).toBe(true);
    });
  });
});
