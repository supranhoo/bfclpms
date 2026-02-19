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
// Pipeline variants without certain stages (guard tests)
const NO_AUDIT_STAGES = ['kra_set', 'self_review', 'manager_check', 'skip_level_check', 'hr_pms_review', 'approved'];
const NO_MANAGEMENT_STAGES = ['kra_set', 'self_review', 'manager_check', 'audit', 'approved'];
const NO_SKIP_LEVEL_STAGES = ['kra_set', 'self_review', 'manager_check', 'hr_pms_review', 'audit', 'management_review', 'approved'];
const NO_HR_PMS_STAGES = ['kra_set', 'self_review', 'manager_check', 'skip_level_check', 'audit', 'management_review', 'approved'];
const MINIMAL_STAGES = ['kra_set', 'self_review', 'manager_check', 'approved'];

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
    it('manager always forwards to manager_check', () => {
      expect(resolveForwardStatus('manager')).toBe('manager_check');
      expect(resolveForwardStatus('manager', EIGHT_STAGE_PIPELINE)).toBe('manager_check');
    });

    it('skip_level advances PAST skip_level_check to the next stage', () => {
      // In 8-stage: skip_level_check → hr_pms_review
      expect(resolveForwardStatus('skip_level', EIGHT_STAGE_PIPELINE)).toBe('hr_pms_review');
      // In default 6-stage: no skip_level_check → fallback 'approved'
      expect(resolveForwardStatus('skip_level', DEFAULT_WORKFLOW_STAGES)).toBe('approved');
    });

    it('hr_pms advances PAST hr_pms_review to the next stage (CORE BUG FIX)', () => {
      // In 8-stage pipeline: hr_pms_review → audit
      expect(resolveForwardStatus('hr_pms', EIGHT_STAGE_PIPELINE)).toBe('audit');
      // In terminal pipeline: hr_pms_review → approved
      const terminalPipeline = ['kra_set', 'self_review', 'manager_check', 'hr_pms_review', 'approved'];
      expect(resolveForwardStatus('hr_pms', terminalPipeline)).toBe('approved');
      // With management after hr_pms:
      const hrPmsThenMgmt = ['kra_set', 'self_review', 'hr_pms_review', 'management_review', 'approved'];
      expect(resolveForwardStatus('hr_pms', hrPmsThenMgmt)).toBe('management_review');
    });

    it('hr_pms falls back to approved when hr_pms_review is last before approved', () => {
      const selfHrPms = ['kra_set', 'self_review', 'hr_pms_review', 'approved'];
      expect(resolveForwardStatus('hr_pms', selfHrPms)).toBe('approved');
    });

    it('auditor forwards to management_review in 8-stage', () => {
      expect(resolveForwardStatus('auditor', EIGHT_STAGE_PIPELINE)).toBe('management_review');
    });

    it('auditor forwards correctly in default pipeline', () => {
      expect(resolveForwardStatus('auditor', DEFAULT_WORKFLOW_STAGES)).toBe('management_review');
    });

    it('management always returns approved', () => {
      expect(resolveForwardStatus('management')).toBe('approved');
      expect(resolveForwardStatus('management', EIGHT_STAGE_PIPELINE)).toBe('approved');
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

  describe('resolveSendBackStatus', () => {
    it('employee target always returns kra_set', () => {
      expect(resolveSendBackStatus('employee', 'manager')).toBe('kra_set');
      expect(resolveSendBackStatus('employee', 'auditor')).toBe('kra_set');
    });

    it('manager target returns self_review (preceding stage)', () => {
      expect(resolveSendBackStatus('manager', 'auditor')).toBe('self_review');
      expect(resolveSendBackStatus('manager', 'management')).toBe('self_review');
      expect(resolveSendBackStatus('manager', 'skip_level', EIGHT_STAGE_PIPELINE)).toBe('self_review');
    });

    it('skip_level target returns manager_check (preceding stage)', () => {
      expect(resolveSendBackStatus('skip_level', 'hr_pms', EIGHT_STAGE_PIPELINE)).toBe('manager_check');
      expect(resolveSendBackStatus('skip_level', 'auditor', EIGHT_STAGE_PIPELINE)).toBe('manager_check');
    });

    it('hr_pms target returns skip_level_check (preceding stage)', () => {
      expect(resolveSendBackStatus('hr_pms', 'auditor', EIGHT_STAGE_PIPELINE)).toBe('skip_level_check');
    });

    it('auditor target returns preceding stage of audit', () => {
      expect(resolveSendBackStatus('auditor', 'management')).toBe('manager_check');
      expect(resolveSendBackStatus('auditor', 'management', EIGHT_STAGE_PIPELINE)).toBe('hr_pms_review');
    });

      it('unknown target returns kra_set', () => {
        expect(resolveSendBackStatus('unknown', 'auditor')).toBe('kra_set');
      });
    });

  // ─────────────────────────────────────────────────────────────────────────
  // Stage-absence guard tests — all reviewer levels, all pipeline variants
  // ─────────────────────────────────────────────────────────────────────────

  describe('resolvePendingStatuses — stage-absence guards', () => {
    it('auditor returns [] when audit stage absent', () => {
      expect(resolvePendingStatuses('auditor', NO_AUDIT_STAGES)).toEqual([]);
    });

    it('auditor returns [] in minimal pipeline (no audit)', () => {
      expect(resolvePendingStatuses('auditor', MINIMAL_STAGES)).toEqual([]);
    });

    it('management returns [] when management_review stage absent', () => {
      expect(resolvePendingStatuses('management', NO_MANAGEMENT_STAGES)).toEqual([]);
    });

    it('management returns [] in minimal pipeline', () => {
      expect(resolvePendingStatuses('management', MINIMAL_STAGES)).toEqual([]);
    });

    it('skip_level returns [] when skip_level_check stage absent', () => {
      expect(resolvePendingStatuses('skip_level', NO_SKIP_LEVEL_STAGES)).toEqual([]);
    });

    it('skip_level returns [] in default pipeline (no skip-level stage)', () => {
      expect(resolvePendingStatuses('skip_level', DEFAULT_WORKFLOW_STAGES)).toEqual([]);
    });

    it('hr_pms returns [] when hr_pms_review stage absent', () => {
      expect(resolvePendingStatuses('hr_pms', NO_HR_PMS_STAGES)).toEqual([]);
    });

    it('hr_pms returns [] in default pipeline (no hr_pms stage)', () => {
      expect(resolvePendingStatuses('hr_pms', DEFAULT_WORKFLOW_STAGES)).toEqual([]);
    });
  });

  describe('resolveReviewableStatuses — stage-absence guards', () => {
    it('auditor returns [] when audit stage absent', () => {
      expect(resolveReviewableStatuses('auditor', NO_AUDIT_STAGES)).toEqual([]);
    });

    it('management returns [] when management_review stage absent', () => {
      expect(resolveReviewableStatuses('management', NO_MANAGEMENT_STAGES)).toEqual([]);
    });

    it('management returns [] in minimal pipeline', () => {
      expect(resolveReviewableStatuses('management', MINIMAL_STAGES)).toEqual([]);
    });

    it('skip_level returns [] when skip_level_check stage absent', () => {
      expect(resolveReviewableStatuses('skip_level', NO_SKIP_LEVEL_STAGES)).toEqual([]);
    });

    it('skip_level returns [] in default pipeline', () => {
      expect(resolveReviewableStatuses('skip_level', DEFAULT_WORKFLOW_STAGES)).toEqual([]);
    });

    it('hr_pms returns [] when hr_pms_review stage absent', () => {
      expect(resolveReviewableStatuses('hr_pms', NO_HR_PMS_STAGES)).toEqual([]);
    });

    it('hr_pms returns [] in default pipeline', () => {
      expect(resolveReviewableStatuses('hr_pms', DEFAULT_WORKFLOW_STAGES)).toEqual([]);
    });
  });

  describe('canReviewKpi — stage-absence guards', () => {
    it('audit returns false when audit stage absent', () => {
      expect(canReviewKpi('manager_check', 'audit', NO_AUDIT_STAGES)).toBe(false);
      expect(canReviewKpi('manager_check', 'audit', MINIMAL_STAGES)).toBe(false);
    });

    it('management returns false when management_review stage absent', () => {
      expect(canReviewKpi('management_review', 'management', NO_MANAGEMENT_STAGES)).toBe(false);
      expect(canReviewKpi('management_review', 'management', MINIMAL_STAGES)).toBe(false);
    });

    it('skip-level-review returns false when skip_level_check stage absent', () => {
      expect(canReviewKpi('manager_check', 'skip-level-review', NO_SKIP_LEVEL_STAGES)).toBe(false);
      expect(canReviewKpi('manager_check', 'skip-level-review', DEFAULT_WORKFLOW_STAGES)).toBe(false);
    });

    it('hr-pms-review returns false when hr_pms_review stage absent', () => {
      expect(canReviewKpi('skip_level_check', 'hr-pms-review', NO_HR_PMS_STAGES)).toBe(false);
      expect(canReviewKpi('skip_level_check', 'hr-pms-review', DEFAULT_WORKFLOW_STAGES)).toBe(false);
    });

    // Positive: stages present, correct status → still true
    it('audit still works when audit stage IS present', () => {
      expect(canReviewKpi('manager_check', 'audit', DEFAULT_WORKFLOW_STAGES)).toBe(true);
      expect(canReviewKpi('hr_pms_review', 'audit', EIGHT_STAGE_PIPELINE)).toBe(true);
    });

    it('management still works when management_review IS present', () => {
      expect(canReviewKpi('management_review', 'management', DEFAULT_WORKFLOW_STAGES)).toBe(true);
    });
  });
});
