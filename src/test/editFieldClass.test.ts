import { describe, it, expect } from 'vitest';
import { isDescriptiveOnly, scoringFields, DESCRIPTIVE_FIELDS } from '@/components/admin/bu-console/editFieldClass';

describe('ADR-321 — descriptive vs scoring fields', () => {
  it('accepts a wording-only change set', () => {
    expect(isDescriptiveOnly({ kpi_title: 'Power generation', kpi_description: 'x' })).toBe(true);
    DESCRIPTIVE_FIELDS.forEach((f) => expect(isDescriptiveOnly({ [f]: 'v' })).toBe(true));
  });

  it('rejects any scoring or structural field', () => {
    ['weightage', 'target_value', 'frequency', 'frequency_cycle_start', 'r5', 'r0',
     'threshold_mode', 'kra_name', 'category_id', 'is_org_level'].forEach((f) => {
      expect(isDescriptiveOnly({ kpi_title: 'x', [f]: '1' })).toBe(false);
      expect(scoringFields({ kpi_title: 'x', [f]: '1' })).toEqual([f]);
    });
  });

  it('an empty change set is never text-only', () => {
    expect(isDescriptiveOnly({})).toBe(false);
    expect(isDescriptiveOnly(null)).toBe(false);
  });
});
