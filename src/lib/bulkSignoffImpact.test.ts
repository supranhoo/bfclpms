import { describe, it, expect } from 'vitest';
import { buildBulkSignoffImpact, type SnapshotCell } from './bulkSignoffImpact';
import type { KpiRule } from './carriedScoreResolver';

const ruleA: KpiRule = {
  id: 'kpi-a', weightage: 10, criteria: 'Higher is Better', uom: 'Number',
  uom_type: 'numeric', target_value: 100, threshold_mode: 'absolute',
  r5: 100, r4: 90, r3: 80, r2: 60, r1: 40, r0: 0,
};
// Same KPI name; different per-employee Wt% AND strict thresholds.
const ruleB: KpiRule = {
  id: 'kpi-b', weightage: 20, criteria: 'Higher is Better', uom: 'Number',
  uom_type: 'numeric', target_value: 100, threshold_mode: 'absolute',
  r5: 100, r4: 98, r3: 95, r2: 90, r1: 85, r0: 80,
};

const baseCell: SnapshotCell = {
  submission_id: null, kpi_id: '', employee_id: '', employee_name: '',
  kpi_name: 'Cost Verification', kra_name: 'Cost Control',
  weightage: 0, is_na: false,
  self_score: null, manager_score: null, skip_level_score: null,
  hr_pms_score: null, auditor_score: null, management_score: null,
  final_score: null,
};

describe('buildBulkSignoffImpact', () => {
  it('two employees, same KPI name, different Wt% + formula → each uses own rule', () => {
    const rows: SnapshotCell[] = [
      { ...baseCell, submission_id: 's1', kpi_id: 'kpi-a',
        employee_id: 'e1', employee_name: 'Aakash', weightage: 10,
        self_score: 4 }, // already scored by self
      { ...baseCell, submission_id: 's2', kpi_id: 'kpi-b',
        employee_id: 'e2', employee_name: 'Rahul', weightage: 20,
        self_score: 5 }, // already scored by self
    ];
    const out = buildBulkSignoffImpact({
      stage: 'manager',
      loadedRows: rows,
      selectedSubmissionIds: new Set(['s1', 's2']),
      ruleByKpiId: new Map([['kpi-a', ruleA], ['kpi-b', ruleB]]),
      achievedBySubmissionId: new Map(),
    });
    expect(out.cells).toHaveLength(2);
    expect(out.cells.find(c => c.submission_id === 's1')).toMatchObject({
      score: 4, source: 'self', weightage: 10, weightedImpact: 0.4,
    });
    expect(out.cells.find(c => c.submission_id === 's2')).toMatchObject({
      score: 5, source: 'self', weightage: 20, weightedImpact: 1,
    });
    expect(out.totals.cellCount).toBe(2);
    expect(out.totals.employeeCount).toBe(2);
    expect(out.totals.skippedCount).toBe(0);
  });

  it('computed fallback uses each row\'s own thresholds', () => {
    const rows: SnapshotCell[] = [
      { ...baseCell, submission_id: 's1', kpi_id: 'kpi-a',
        employee_id: 'e1', employee_name: 'Aakash', weightage: 10,
        self_score: 3 }, // make resolver pick computed by NOT having upstream for stage manager… wait
    ];
    // For stage 'manager', resolver still carries self_score. To force
    // 'computed' we drop self_score and supply achieved_value.
    rows[0].self_score = null;
    const out = buildBulkSignoffImpact({
      stage: 'manager',
      loadedRows: rows,
      selectedSubmissionIds: new Set(['s1']),
      ruleByKpiId: new Map([['kpi-a', ruleA]]),
      achievedBySubmissionId: new Map([['s1', 85]]),
    });
    expect(out.cells[0]).toMatchObject({ source: 'computed', score: 3 });
    expect(out.totals.computedCount).toBe(1);
  });

  it('skipped cells flagged as none and counted', () => {
    const rows: SnapshotCell[] = [
      { ...baseCell, submission_id: 's1', kpi_id: 'kpi-a',
        employee_id: 'e1', employee_name: 'Aakash', weightage: 10 },
    ];
    const out = buildBulkSignoffImpact({
      stage: 'manager',
      loadedRows: rows,
      selectedSubmissionIds: new Set(['s1']),
      ruleByKpiId: new Map([['kpi-a', ruleA]]),
      achievedBySubmissionId: new Map(),
    });
    expect(out.cells[0]).toMatchObject({ source: 'none', score: null, weightedImpact: null });
    expect(out.totals.skippedCount).toBe(1);
    expect(out.perEmployee[0]).toMatchObject({ cellsInBatch: 1, skippedInBatch: 1 });
  });

  it('N/A rows excluded from current and projected totals', () => {
    const rows: SnapshotCell[] = [
      { ...baseCell, submission_id: 's1', kpi_id: 'kpi-a',
        employee_id: 'e1', employee_name: 'Aakash', weightage: 10,
        self_score: 4 },
      { ...baseCell, submission_id: 's-na', kpi_id: 'kpi-a',
        employee_id: 'e1', employee_name: 'Aakash', weightage: 30,
        is_na: true, self_score: 5 },
    ];
    const out = buildBulkSignoffImpact({
      stage: 'manager',
      loadedRows: rows,
      selectedSubmissionIds: new Set(['s1']),
      ruleByKpiId: new Map([['kpi-a', ruleA]]),
      achievedBySubmissionId: new Map(),
    });
    const emp = out.perEmployee[0];
    // Only s1 (wt 10, self 4) → overall = 4
    expect(emp.currentOverall).toBe(4);
    expect(emp.projectedOverall).toBe(4);
  });

  it('per-employee delta reflects newly stamped score on stage column', () => {
    const rows: SnapshotCell[] = [
      // Scored elsewhere — anchors current overall.
      { ...baseCell, submission_id: 'anchor', kpi_id: 'kpi-a',
        employee_id: 'e1', employee_name: 'Aakash', weightage: 50,
        self_score: 3 },
      // Batch cell — no prior score; computed will fire.
      { ...baseCell, submission_id: 's1', kpi_id: 'kpi-b',
        employee_id: 'e1', employee_name: 'Aakash', weightage: 50 },
    ];
    const out = buildBulkSignoffImpact({
      stage: 'manager',
      loadedRows: rows,
      selectedSubmissionIds: new Set(['s1']),
      ruleByKpiId: new Map([['kpi-a', ruleA], ['kpi-b', ruleB]]),
      achievedBySubmissionId: new Map([['s1', 99]]),
    });
    const emp = out.perEmployee[0];
    // current: only anchor counts (3 × 50 / 50) = 3
    expect(emp.currentOverall).toBe(3);
    // projected: (3 × 50 + 4 × 50) / 100 = 3.5 (99 ≥ R4=98 on ruleB)
    expect(emp.projectedOverall).toBe(3.5);
    expect(emp.delta).toBe(0.5);
  });
});
