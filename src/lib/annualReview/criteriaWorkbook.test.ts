import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseCriteriaPackWorkbook } from './criteriaWorkbook';

/**
 * Regression: importer used to be section-blind and pulled System KPIs,
 * Eligibility gates, and Self Review free-text prompts into the criteria
 * library with empty scoring_bands (which then rendered as the generic
 * English 0-5 ladder in the editor). Only Type-block rows with a bilingual
 * rating ladder are valid criteria.
 */
function buildBfclGenericSheet(): ArrayBuffer {
  const rows: (string | number | null)[][] = [
    ['Generic - Blue Collar', null, null, null],
    [null, 'Criteria', 'Discription', 'Wt%'],
    ['Eligibility', 'Eligibility', 'Absent Days (0 Absent Days)', null],
    [null, null, 'LWP Days (<30 LWP Days)', null],
    ['System', 'LTI (Lost Time Injury) Rate', 'Any departmental LTI (5=0, 4=1)', 3],
    [null, '5S', 'Departmental Status of 5S (5=5, 4=4)', 5],
    ['Type', 'Criteria', 'Rating - Discription', 'Wt%'],
    [
      'Generic Blue-Collar Questions',
      'Attendance & Punctuality / उपस्थिति',
      '5 - Always on time. / हमेशा समय पर।\n4 - Consistently punctual. / लगातार समय पर।\n0 - Unacceptable. / अस्वीकार्य।',
      5,
    ],
    [
      null,
      'PPE, Safety Rules / पीपीई, सुरक्षा नियम',
      '5 - Sets a strong example. / मजबूत उदाहरण।\n0 - Causes risk. / जोखिम।',
      5,
    ],
    ['Self Review Fields', 'What new skill do you want to learn?', null, null],
    [null, 'How can we make the shop safer?', null, null],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Generic - W');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

describe('parseCriteriaPackWorkbook — section awareness', () => {
  const sheets = parseCriteriaPackWorkbook(buildBfclGenericSheet());

  it('returns exactly one sheet', () => {
    expect(sheets).toHaveLength(1);
  });

  it('imports only the 2 Type-block criteria rows', () => {
    const labels = sheets[0].rows.map((r) => r.label_en);
    expect(labels).toEqual(['Attendance & Punctuality', 'PPE, Safety Rules']);
  });

  it('excludes System KPI rows (5S, LTI)', () => {
    const joined = sheets[0].rows.map((r) => r.label_en).join('|');
    expect(joined).not.toMatch(/LTI|5S/i);
  });

  it('excludes Self Review free-text prompts', () => {
    const joined = sheets[0].rows.map((r) => r.label_en).join('|');
    expect(joined).not.toMatch(/skill|shop/i);
  });

  it('preserves the bilingual rating ladder in rating_desc', () => {
    expect(sheets[0].rows[0].rating_desc).toMatch(/^5 - Always on time/);
    expect(sheets[0].rows[0].rating_desc).toContain('हमेशा समय पर');
  });
});