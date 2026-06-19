import { describe, it, expect } from 'vitest';
import {
  mapEntryToTemplateField, mapBundleToTemplateFields, applyEntriesToSections,
} from './selfReviewLibrary';
import type { SelfReviewLibraryEntry, TemplateSections } from '@/types/annualReview';

const ENTRY: SelfReviewLibraryEntry = {
  id: 'lib-1', kind: 'field', key: 'achievements', category: 'general',
  label_en: 'Achievements', label_hi: 'उपलब्धियाँ',
  placeholder_en: 'List…', placeholder_hi: 'लिखें…',
  required: true, is_builtin: true, is_active: true, sort_order: 10,
  created_by: null, created_at: '', updated_at: '',
};

const seq = () => { let n = 0; return () => `f_${++n}`; };

describe('selfReviewLibrary mapper', () => {
  it('maps a field entry with EN only when includeHindi=false', () => {
    const out = mapEntryToTemplateField(ENTRY, { includeHindi: false, makeId: seq() });
    expect(out.field).toEqual({ id: 'f_1', label: 'Achievements', placeholder: 'List…', required: true });
    expect(out.translations.hi).toBeUndefined();
  });

  it('includes Hindi translations when enabled', () => {
    const out = mapEntryToTemplateField(ENTRY, { includeHindi: true, makeId: seq() });
    expect(out.translations.hi).toEqual({
      'field:f_1:label': 'उपलब्धियाँ',
      'field:f_1:placeholder': 'लिखें…',
    });
  });

  it('rejects bundle entries', () => {
    expect(() => mapEntryToTemplateField({ ...ENTRY, kind: 'bundle' }, { includeHindi: false }))
      .toThrow(/must be of kind "field"/);
  });

  it('expands bundles preserving order with unique generated IDs', () => {
    const fields = [ENTRY, { ...ENTRY, id: 'lib-2', key: 'challenges', label_en: 'Challenges', label_hi: 'चुनौतियाँ' }];
    const out = mapBundleToTemplateFields(fields, { includeHindi: true, makeId: seq() });
    expect(out.fields.map((f) => f.label)).toEqual(['Achievements', 'Challenges']);
    expect(Object.keys(out.translations.hi ?? {})).toHaveLength(3);
  });

  it('appends to existing sections without losing prior data', () => {
    const sections: TemplateSections = {
      self_review_fields: [{ id: 'old', label: 'Old', required: false }],
      translations: { hi: { 'field:old:label': 'पुराना' } },
    };
    const next = applyEntriesToSections(sections, [ENTRY], { includeHindi: true, makeId: seq() });
    expect(next.self_review_fields).toHaveLength(2);
    expect(next.translations?.hi?.['field:old:label']).toBe('पुराना');
    expect(next.translations?.hi?.['field:f_1:label']).toBe('उपलब्धियाँ');
  });
});