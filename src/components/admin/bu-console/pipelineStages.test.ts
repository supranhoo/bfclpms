import { describe, it, expect } from 'vitest';
import { stageLabel, sortStages } from './pipelineStages';

describe('ADR-284 pipeline stage rail', () => {
  it('labels canonical workflow stages in business language', () => {
    expect(stageLabel('self_review')).toBe('Self review');
    expect(stageLabel('hr_pms_review')).toBe('HR PMS');
    expect(stageLabel('management_review')).toBe('Management');
  });

  it('never drops an unknown stage — it is humanised and kept last', () => {
    expect(stageLabel('some_new_stage')).toBe('some new stage');
    const sorted = sortStages([
      { stage: 'approved' },
      { stage: 'some_new_stage' },
      { stage: 'manager_check' },
      { stage: 'self_review' },
    ]);
    expect(sorted.map(s => s.stage)).toEqual([
      'self_review', 'manager_check', 'approved', 'some_new_stage',
    ]);
  });
});
