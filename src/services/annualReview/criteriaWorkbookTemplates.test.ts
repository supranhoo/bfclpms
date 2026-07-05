import { describe, expect, it } from 'vitest';
import { buildTemplateSectionsFromSheet } from './criteriaWorkbookTemplates';
import type { ParsedCriteriaSheet } from '@/lib/annualReview/criteriaWorkbook';

describe('buildTemplateSectionsFromSheet', () => {
  it('preserves workbook system rows and stamps the 3-stage workflow', () => {
    const sheet: ParsedCriteriaSheet = {
      name: 'HK - W',
      systemRows: [
        { label_en: 'LTI', label_hi: null, description: 'Lost time injury', weight_pct: 15 },
        { label_en: '5S', label_hi: null, description: 'Housekeeping score', weight_pct: 20 },
      ],
      rows: [
        {
          label_en: 'Attendance',
          label_hi: 'उपस्थिति',
          rating_desc: '5 - Excellent / उत्कृष्ट\n4 - Good / अच्छा\n3 - Average / औसत\n2 - Low / कम\n1 - Poor / खराब\n0 - Unacceptable / अस्वीकार्य',
          weight_pct: 65,
        },
      ],
    };

    const sections = buildTemplateSectionsFromSheet(sheet, {
      sheet_key: { source: 'criteria_workbook', sheet_name: sheet.name, cycle_id: 'cycle-1' },
    });

    expect(sections.enabled_stages).toEqual(['self', 'dept_head', 'bu_head']);
    expect(sections.stage_weights).toEqual({ system: 35, dept_head: 45.5, bu_head: 19.5 });
    expect(sections.system_scores).toMatchObject([
      { name: 'LTI', weight: 15, source: 'workbook' },
      { name: '5S', weight: 20, source: 'workbook' },
    ]);
    expect(sections.criteria).toMatchObject([
      { name: 'Attendance', weight: 65, reviewer_stages: ['self', 'dept_head', 'bu_head'] },
    ]);
  });
});