import { describe, it, expect } from 'vitest';
import { resolveBottleneckStage } from './bottleneckResolver';

const SIX_STAGE = ['kra_set', 'self_review', 'manager_check', 'audit', 'management_review', 'approved'];
const EIGHT_STAGE = ['kra_set', 'self_review', 'manager_check', 'skip_level_check', 'hr_pms_review', 'audit', 'management_review', 'approved'];

describe('resolveBottleneckStage', () => {
  it('kra_set -> awaiting_self_review', () => {
    expect(resolveBottleneckStage('kra_set', SIX_STAGE).stageKey).toBe('awaiting_self_review');
  });

  it('self_review -> awaiting_manager', () => {
    expect(resolveBottleneckStage('self_review', SIX_STAGE).stageKey).toBe('awaiting_manager');
  });

  it('audit -> awaiting_audit (NOT awaiting_management)', () => {
    expect(resolveBottleneckStage('audit', SIX_STAGE).stageKey).toBe('awaiting_audit');
    expect(resolveBottleneckStage('audit', EIGHT_STAGE).stageKey).toBe('awaiting_audit');
  });

  it('management_review -> awaiting_management (NOT approved/dropped)', () => {
    expect(resolveBottleneckStage('management_review', SIX_STAGE).stageKey).toBe('awaiting_management');
    expect(resolveBottleneckStage('management_review', EIGHT_STAGE).stageKey).toBe('awaiting_management');
  });

  it('manager_check in 8-stage -> awaiting_skip_level', () => {
    expect(resolveBottleneckStage('manager_check', EIGHT_STAGE).stageKey).toBe('awaiting_skip_level');
  });

  it('manager_check in 6-stage -> awaiting_audit', () => {
    expect(resolveBottleneckStage('manager_check', SIX_STAGE).stageKey).toBe('awaiting_audit');
  });

  it('skip_level_check in 8-stage -> awaiting_hr_pms', () => {
    expect(resolveBottleneckStage('skip_level_check', EIGHT_STAGE).stageKey).toBe('awaiting_hr_pms');
  });

  it('hr_pms_review in 8-stage -> awaiting_audit', () => {
    expect(resolveBottleneckStage('hr_pms_review', EIGHT_STAGE).stageKey).toBe('awaiting_audit');
  });
});
