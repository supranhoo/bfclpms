import { describe, it, expect } from 'vitest';
import {
  GOVERNANCE_STAGES,
  STAGE_LABELS,
  PERMISSION_KEYS,
  PERMISSION_LABELS,
  GovernanceStage,
} from '@/hooks/useReviewPeriodGovernance';

describe('Governance Constants', () => {
  describe('GOVERNANCE_STAGES', () => {
    it('contains exactly 6 stages', () => {
      expect(GOVERNANCE_STAGES).toHaveLength(6);
    });

    it('has stages in correct lifecycle order', () => {
      expect([...GOVERNANCE_STAGES]).toEqual([
        'planning',
        'self_review',
        'manager_review',
        'calibration',
        'approval',
        'closed',
      ]);
    });

    it('starts with planning and ends with closed', () => {
      expect(GOVERNANCE_STAGES[0]).toBe('planning');
      expect(GOVERNANCE_STAGES[GOVERNANCE_STAGES.length - 1]).toBe('closed');
    });
  });

  describe('STAGE_LABELS', () => {
    it('has a label for every stage', () => {
      GOVERNANCE_STAGES.forEach(stage => {
        expect(STAGE_LABELS[stage]).toBeDefined();
        expect(typeof STAGE_LABELS[stage]).toBe('string');
        expect(STAGE_LABELS[stage].length).toBeGreaterThan(0);
      });
    });

    it('maps to correct human-readable labels', () => {
      expect(STAGE_LABELS.planning).toBe('Planning');
      expect(STAGE_LABELS.self_review).toBe('Self Review');
      expect(STAGE_LABELS.manager_review).toBe('Manager Review');
      expect(STAGE_LABELS.calibration).toBe('Calibration');
      expect(STAGE_LABELS.approval).toBe('Approval');
      expect(STAGE_LABELS.closed).toBe('Closed');
    });
  });

  describe('PERMISSION_KEYS', () => {
    it('contains exactly 7 permission types', () => {
      expect(PERMISSION_KEYS).toHaveLength(7);
    });

    it('includes all required permission actions', () => {
      const expected = [
        'edit_kpi',
        'submit_self_review',
        'submit_manager_review',
        'approve',
        'edit_scores',
        'add_comments',
        'view_only',
      ];
      expect([...PERMISSION_KEYS]).toEqual(expected);
    });
  });

  describe('PERMISSION_LABELS', () => {
    it('has a label for every permission key', () => {
      PERMISSION_KEYS.forEach(key => {
        expect(PERMISSION_LABELS[key]).toBeDefined();
        expect(typeof PERMISSION_LABELS[key]).toBe('string');
      });
    });
  });

  describe('Stage index calculations', () => {
    it('indexOf returns correct index for each stage', () => {
      expect(GOVERNANCE_STAGES.indexOf('planning')).toBe(0);
      expect(GOVERNANCE_STAGES.indexOf('self_review')).toBe(1);
      expect(GOVERNANCE_STAGES.indexOf('closed')).toBe(5);
    });

    it('returns -1 for unknown stage', () => {
      expect(GOVERNANCE_STAGES.indexOf('nonexistent' as GovernanceStage)).toBe(-1);
    });

    it('progress percentage calculation matches Overview component logic', () => {
      const calcProgress = (stage: string) => {
        const idx = GOVERNANCE_STAGES.indexOf(stage as GovernanceStage);
        return idx >= 0 ? Math.round(((idx + 1) / GOVERNANCE_STAGES.length) * 100) : 0;
      };
      expect(calcProgress('planning')).toBe(17);
      expect(calcProgress('closed')).toBe(100);
      expect(calcProgress('unknown')).toBe(0);
    });

    it('canAdvance is false at last stage, canRevert is false at first stage', () => {
      const canAdvance = (stage: string) => {
        const idx = GOVERNANCE_STAGES.indexOf(stage as GovernanceStage);
        return idx >= 0 && idx < GOVERNANCE_STAGES.length - 1;
      };
      const canRevert = (stage: string) => {
        const idx = GOVERNANCE_STAGES.indexOf(stage as GovernanceStage);
        return idx > 0;
      };
      expect(canAdvance('planning')).toBe(true);
      expect(canAdvance('closed')).toBe(false);
      expect(canRevert('planning')).toBe(false);
      expect(canRevert('closed')).toBe(true);
    });
  });

  describe('Lock hierarchy logic', () => {
    it('Employee lock takes precedence over Department lock', () => {
      const hierarchy = ['employee', 'department', 'role', 'global'];
      const resolve = (locks: { lock_type: string; is_locked: boolean }[]) => {
        for (const type of hierarchy) {
          const lock = locks.find(l => l.lock_type === type);
          if (lock) return lock;
        }
        return null;
      };

      const locks = [
        { lock_type: 'global', is_locked: true },
        { lock_type: 'employee', is_locked: false },
      ];
      const winner = resolve(locks);
      expect(winner?.lock_type).toBe('employee');
      expect(winner?.is_locked).toBe(false);
    });
  });
});
