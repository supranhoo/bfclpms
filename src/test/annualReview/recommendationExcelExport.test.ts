/** ADR-226 — locked Excel export contract for the recommendation queue. */
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
  RECOMMENDATION_EXPORT_COLUMNS,
  buildRecommendationRows,
  buildRecommendationWorkbook,
  describeRecommendationFilters,
} from '@/lib/annualReview/recommendationExport';
import type { RecommendationQueueRow } from '@/services/annualReview/recommendations';

const row = (over: Partial<RecommendationQueueRow> = {}): RecommendationQueueRow => ({
  id: 'r1', instance_id: 'i1', employee_id: 'e1', employee_code: '101381',
  employee_name: 'Anup', department_name: '45 MW-Operation', business_unit_name: '45 MW',
  designation_name: 'Engineer', reviewer_role: 'bu_head' as never, reviewer_name: 'Jitendra',
  type_keys: ['promotion'], type_labels: ['Promotion', 'Training / development'],
  is_monetary: false, amount_kind: 'percent', amount_value: 8,
  approved_amount_kind: null, approved_amount_value: null,
  proposed_designation: null, proposed_grade: null, effective_from: null,
  narrative: 'Recommended\nfor  promotion ', status: 'needs_classification',
  source: 'legacy_import', decided_at: null, decision_reason: null,
  final_rating: '4.10', total_score: 82, created_at: '2026-08-01T14:06:14Z',
  total_count: 1375, ...over,
});

describe('recommendation Excel export', () => {
  it('locks the column order', () => {
    expect(RECOMMENDATION_EXPORT_COLUMNS).toEqual([
      'Employee code', 'Employee', 'Department', 'Business unit', 'Designation',
      'Recommended by', 'Stage', 'Types', 'Amount asked', 'Amount approved',
      'Proposed designation', 'Proposed grade', 'Effective from', 'Rating',
      'Status', 'Source', 'Decision reason', 'Narrative',
    ]);
  });

  it('formats amounts, statuses, types and collapses narrative whitespace', () => {
    const [cells] = buildRecommendationRows([row()]);
    expect(cells).toHaveLength(RECOMMENDATION_EXPORT_COLUMNS.length);
    expect(cells[7]).toBe('Promotion; Training / development');
    expect(cells[8]).toBe('8%');
    expect(cells[9]).toBe('—');
    expect(cells[14]).toBe('Needs classification');
    expect(cells[15]).toBe('Legacy import');
    expect(cells[17]).toBe('Recommended for promotion');
  });

  it('labels stage-form rows distinctly from legacy imports', () => {
    expect(buildRecommendationRows([row({ source: 'stage_form' })])[0][15]).toBe('Review form');
  });

  it('handles an empty row set without throwing', () => {
    expect(buildRecommendationRows([])).toEqual([]);
  });

  it('stamps the filter note into the sheet', () => {
    const note = describeRecommendationFilters({
      status: 'needs_classification', typeKey: 'promotion',
      monetaryOnly: true, search: ' anup ', source: 'legacy_import',
    });
    expect(note).toContain('Status: needs_classification');
    expect(note).toContain('Monetary only: yes');
    expect(note).toContain('Search: anup');

    const wb = buildRecommendationWorkbook([row()], note);
    const aoa = XLSX.utils.sheet_to_json<string[]>(wb.Sheets.Recommendations, { header: 1 });
    expect(aoa[0][0]).toBe('Employee code');
    expect(aoa[1][0]).toBe('101381');
    expect(aoa.some((r) => String(r[0] ?? '').startsWith('Filters —'))).toBe(true);
    expect(aoa.some((r) => String(r[0] ?? '').startsWith('Exported:'))).toBe(true);
  });
});