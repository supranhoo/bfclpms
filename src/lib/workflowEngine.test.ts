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
  });

  describe('resolveReviewableStatuses', () => {
    it('auditor can review self_review in skip_manager', () => {
      const statuses = resolveReviewableStatuses('auditor', SKIP_MANAGER_STAGES);
      expect(statuses).toContain('self_review');
    });
  });

  describe('getVisibleJourneyStages', () => {
    it('full pipeline shows all 4 journey stages', () => {
      expect(getVisibleJourneyStages()).toEqual(['self', 'manager', 'auditor', 'management']);
    });

    it('skip_manager shows 3 journey stages', () => {
      expect(getVisibleJourneyStages(SKIP_MANAGER_STAGES)).toEqual(['self', 'auditor', 'management']);
    });
  });

  describe('canReviewKpi', () => {
    it('audit can review self_review when manager skipped', () => {
      expect(canReviewKpi('self_review', 'audit', SKIP_MANAGER_STAGES)).toBe(true);
    });

    it('audit cannot review self_review in full pipeline', () => {
      expect(canReviewKpi('self_review', 'audit')).toBe(false);
    });
  });
});
