import { describe, it, expect } from 'vitest';
import {
  kpiRowKey, submissionIdsForKpiRow, submissionIdsForVisibleKpiRow, toggleKpiRowSelection,
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

  it('submissionIdsForVisibleKpiRow scopes to visible employees only', () => {
    // 1 KPI focus with 4 visible employees out of 6 in the loaded snapshot.
    const kpiKey = 'Cost Control|Cost Centre Verification';
    const cellMap = new Map<string, { submission_id: string | null }>([
      [`${kpiKey}::e1`, { submission_id: 'v1' }],
      [`${kpiKey}::e2`, { submission_id: 'v2' }],
      [`${kpiKey}::e3`, { submission_id: 'v3' }],
      [`${kpiKey}::e4`, { submission_id: 'v4' }],
      // e5/e6 exist in snapshot but are NOT in the visible employees list.
      [`${kpiKey}::e5`, { submission_id: 'hidden5' }],
      [`${kpiKey}::e6`, { submission_id: 'hidden6' }],
    ]);
    const visibleEmployees = [{ id: 'e1' }, { id: 'e2' }, { id: 'e3' }, { id: 'e4' }];
    const ids = submissionIdsForVisibleKpiRow(visibleEmployees, cellMap, kpiKey);
    expect(ids).toEqual(['v1', 'v2', 'v3', 'v4']);
    expect(ids).not.toContain('hidden5');
    expect(ids).not.toContain('hidden6');
  });

  it('submissionIdsForVisibleKpiRow skips unscored cells', () => {
    const kpiKey = 'K|N';
    const cellMap = new Map<string, { submission_id: string | null }>([
      [`${kpiKey}::e1`, { submission_id: 's1' }],
      [`${kpiKey}::e2`, { submission_id: null }],
    ]);
    expect(submissionIdsForVisibleKpiRow([{ id: 'e1' }, { id: 'e2' }], cellMap, kpiKey))
      .toEqual(['s1']);
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