import { describe, it, expect } from 'vitest';
import { rowToCriterion } from '@/components/annual-review/CriteriaLibraryPickerDialog';
import type { CriterionRow } from '@/services/annualReview/criteriaLibrary';

const baseRow = (patch: Partial<CriterionRow> = {}): CriterionRow => ({
  id: 'row1',
  key: 'attendance',
  label_en: 'Attendance',
  label_hi: null,
  max_score: 5,
  scoring_bands: [],
  is_common: false,
  is_active: true,
  sort_order: 0,
  created_at: null,
  updated_at: null,
  ...patch,
} as CriterionRow);

describe('CriteriaLibraryPickerDialog.rowToCriterion — hi translation seeding', () => {
  it('emits criterion + option Hindi translation keys when label_hi is present', () => {
    const row = baseRow({
      label_hi: 'उपस्थिति',
      scoring_bands: [
        { score: 5, label_en: 'Outstanding', label_hi: 'उत्कृष्ट' },
        { score: 4, label_en: 'On target',   label_hi: 'लक्ष्य पर' },
        { score: 3, label_en: 'Meets',       label_hi: null },
      ] as unknown as CriterionRow['scoring_bands'],
    });
    const { criterion, hiTranslations } = rowToCriterion(row);
    expect(hiTranslations[`criterion:${criterion.id}:name`]).toBe('उपस्थिति');
    expect(hiTranslations[`option:${criterion.id}:o5:label`]).toBe('उत्कृष्ट');
    expect(hiTranslations[`option:${criterion.id}:o4:label`]).toBe('लक्ष्य पर');
    // Bands without label_hi don't seed a translation entry.
    expect(hiTranslations[`option:${criterion.id}:o3:label`]).toBeUndefined();
  });

  it('returns an empty translation map when the row has no Hindi text', () => {
    const { hiTranslations } = rowToCriterion(baseRow());
    expect(Object.keys(hiTranslations)).toHaveLength(0);
  });
});