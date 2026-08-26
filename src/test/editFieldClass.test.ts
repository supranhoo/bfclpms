import { describe, it, expect } from 'vitest';
import { isDescriptiveOnly, scoringFields, DESCRIPTIVE_FIELDS } from '@/components/admin/bu-console/editFieldClass';

describe('ADR-321 — descriptive vs scoring fields', () => {
  it('accepts a wording-only change set', () => {
    expect(isDescriptiveOnly({ kpi_title: 'Power generation', kpi_description: 'x' })).toBe(true);
    DESCRIPTIVE_FIELDS.forEach((f) => expect(isDescriptiveOnly({ [f]: 'v' })).toBe(true));
  });

  it('rejects any scoring or structural field', () => {
    ['weightage', 'target_value', 'frequency', 'frequency_cycle_start', 'day_count_type',
     'uom_type', 'qualitative_options', 'r5', 'r4', 'r3', 'r2', 'r1', 'r0',
     'threshold_mode', 'kra_name', 'category_id', 'is_org_level', 'org_level_scope',
     'business_unit_id', 'location_id', 'division_id', 'pms_grade_id', 'level_id',
     'require_resubmit_reason', 'is_frequency_locked'].forEach((f) => {
      expect(isDescriptiveOnly({ kpi_title: 'x', [f]: '1' })).toBe(false);
      expect(scoringFields({ kpi_title: 'x', [f]: '1' })).toEqual([f]);
    });
  });

  it('treats formula and scoring-logic copy as explanatory definition text', () => {
    expect(isDescriptiveOnly({
      kpi_formula: '(actual / target) × 100',
      kpi_scoring_logic: 'Rating 5 at or above 100%',
    })).toBe(true);
  });

  it('an empty change set is never text-only', () => {
    expect(isDescriptiveOnly({})).toBe(false);
    expect(isDescriptiveOnly(null)).toBe(false);
  });
});
