import { describe, it, expect } from 'vitest';
import { ALL_WORKFLOW_STAGES } from '@/components/dashboard/KpiTimeline';
import { statusLabels } from '@/lib/reviewConstants';

describe('KpiTimeline ALL_WORKFLOW_STAGES', () => {
  const expectedOrder = [
    'kra_set',
    'self_review',
    'manager_check',
    'skip_level_check',
    'hr_pms_review',
    'audit',
    'management_review',
    'approved',
  ];

  it('contains all 8 canonical stages in order', () => {
    expect(ALL_WORKFLOW_STAGES.map(s => s.key)).toEqual(expectedOrder);
  });

  it('every stage key has a matching statusLabels entry', () => {
    for (const stage of ALL_WORKFLOW_STAGES) {
      expect(statusLabels[stage.key]).toBeDefined();
    }
  });

  it('includes Skip-Level and HR PMS so the Workflow Progress bar can render them', () => {
    const keys = ALL_WORKFLOW_STAGES.map(s => s.key);
    expect(keys).toContain('skip_level_check');
    expect(keys).toContain('hr_pms_review');
  });

  it('filtering by a propStages subset preserves canonical order', () => {
    const subset = ['kra_set', 'self_review', 'manager_check', 'hr_pms_review', 'approved'];
    const filtered = ALL_WORKFLOW_STAGES.filter(s => subset.includes(s.key)).map(s => s.key);
    expect(filtered).toEqual(subset);
  });

  it('filtering drops stages not present in the resolved workflow', () => {
    const subset = ['kra_set', 'self_review', 'manager_check', 'audit', 'management_review', 'approved'];
    const filtered = ALL_WORKFLOW_STAGES.filter(s => subset.includes(s.key)).map(s => s.key);
    expect(filtered).not.toContain('skip_level_check');
    expect(filtered).not.toContain('hr_pms_review');
  });
});