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
  const attendanceRating = '5 - Always on time; zero unexcused absence; supports reliable shift continuity. / हमेशा समय पर; कोई अनधिकृत अनुपस्थिति नहीं; शिफ्ट निरंतरता में सहयोग करता है।\r4 - Consistently punctual; informs supervisor in advance for leave or delay. / लगातार समय पर; छुट्टी या देरी की सूचना पहले से सुपरवाइजर को देता है।\r3 - Generally punctual; occasional valid absence or delay with proper intimation. / सामान्यतः समय पर; उचित सूचना के साथ कभी-कभार वैध अनुपस्थिति या देरी।\r2 - Irregular attendance; needs repeated reminders to report on time or plan leave. / अनियमित उपस्थिति; समय पर आने या छुट्टी की योजना के लिए बार-बार याद दिलाना पड़ता है।\r1 - Very poor attendance; frequent late coming or absence disrupts shift planning. / बहुत खराब उपस्थिति; बार-बार देर से आना या अनुपस्थिति से शिफ्ट योजना प्रभावित होती है।\r0 - Unacceptable attendance pattern; repeated unauthorized absence or habitual late reporting. / अस्वीकार्य उपस्थिति; बार-बार अनधिकृत अनुपस्थिति या आदतन देर से रिपोर्टिंग।';
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
      'Attendance & Punctuality / उपस्थिति और समय की पाबंदी',
      attendanceRating,
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
    expect(sheets[0].rows[0].rating_desc).toContain('0 - Unacceptable attendance pattern');
  });
});

describe('parseCriteriaPackWorkbook — simple Criteria + Rating Description layout', () => {
  it('maps the Criteria cell to the criterion and the Rating cell to all six scoring labels', () => {
    const rating = '5 - Always on time; zero unexcused absence; supports reliable shift continuity. / हमेशा समय पर; कोई अनधिकृत अनुपस्थिति नहीं; शिफ्ट निरंतरता में सहयोग करता है। 4 - Consistently punctual; informs supervisor in advance for leave or delay. / लगातार समय पर; छुट्टी या देरी की सूचना पहले से सुपरवाइजर को देता है। 3 - Generally punctual; occasional valid absence or delay with proper intimation. / सामान्यतः समय पर; उचित सूचना के साथ कभी-कभार वैध अनुपस्थिति या देरी। 2 - Irregular attendance; needs repeated reminders to report on time or plan leave. / अनियमित उपस्थिति; समय पर आने या छुट्टी की योजना के लिए बार-बार याद दिलाना पड़ता है। 1 - Very poor attendance; frequent late coming or absence disrupts shift planning. / बहुत खराब उपस्थिति; बार-बार देर से आना या अनुपस्थिति से शिफ्ट योजना प्रभावित होती है। 0 - Unacceptable attendance pattern; repeated unauthorized absence or habitual late reporting. / अस्वीकार्य उपस्थिति; बार-बार अनधिकृत अनुपस्थिति या आदतन देर से रिपोर्टिंग।';
    const ws = XLSX.utils.aoa_to_sheet([
      ['Criteria', 'Rating - Discription'],
      ['Attendance & Punctuality / उपस्थिति और समय की पाबंदी', rating],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Simple Criteria');
    const sheets = parseCriteriaPackWorkbook(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);

    expect(sheets).toHaveLength(1);
    expect(sheets[0].rows).toHaveLength(1);
    expect(sheets[0].rows[0]).toMatchObject({
      label_en: 'Attendance & Punctuality',
      label_hi: 'उपस्थिति और समय की पाबंदी',
      weight_pct: 0,
    });
    expect(sheets[0].rows[0].rating_desc).toContain('5 - Always on time');
    expect(sheets[0].rows[0].rating_desc).toContain('0 - Unacceptable attendance pattern');
  });
});