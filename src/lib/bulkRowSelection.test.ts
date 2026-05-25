import { describe, it, expect } from 'vitest';
import {
  kpiRowKey, submissionIdsForKpiRow, toggleKpiRowSelection,
} from './bulkRowSelection';

const ROWS = [
  { kra_name: 'Quality', kpi_name: 'Rejection %', submission_id: 's1' },
  { kra_name: 'Quality', kpi_name: 'Rejection %', submission_id: 's2' },
  { kra_name: 'Quality', kpi_name: 'Rejection %', submission_id: null }, // unscored
  { kra_name: 'Quality', kpi_name: 'Audit Score', submission_id: 's3' },
  { kra_name: 'Safety',  kpi_name: 'LTI Count',   submission_id: 's4' },
];

describe('bulkRowSelection', () => {
  it('kpiRowKey joins kra + kpi', () => {
    expect(kpiRowKey(ROWS[0])).toBe('Quality|Rejection %');
  });

  it('submissionIdsForKpiRow returns only scored cells of that KPI', () => {
    expect(submissionIdsForKpiRow(ROWS, 'Quality|Rejection %')).toEqual(['s1', 's2']);
    expect(submissionIdsForKpiRow(ROWS, 'Safety|LTI Count')).toEqual(['s4']);
    expect(submissionIdsForKpiRow(ROWS, 'Missing|Missing')).toEqual([]);
  });

  it('toggleKpiRowSelection selects all when none/some are on', () => {
    const next = toggleKpiRowSelection(new Set(), ['s1', 's2']);
    expect([...next].sort()).toEqual(['s1', 's2']);

    const partial = toggleKpiRowSelection(new Set(['s1']), ['s1', 's2']);
    expect([...partial].sort()).toEqual(['s1', 's2']);
  });

  it('toggleKpiRowSelection deselects all when fully on, preserving others', () => {
    const prev = new Set(['s1', 's2', 's4']);
    const next = toggleKpiRowSelection(prev, ['s1', 's2']);
    expect([...next]).toEqual(['s4']);
  });

  it('empty ids is a no-op', () => {
    const prev = new Set(['s1']);
    expect([...toggleKpiRowSelection(prev, [])]).toEqual(['s1']);
  });
});