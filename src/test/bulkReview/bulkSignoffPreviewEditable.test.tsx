import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BulkSignoffPreview } from '@/components/review/BulkSignoffPreview';
import type { ImpactSummary, CellPreview } from '@/lib/bulkSignoffImpact';
import type { KpiRule } from '@/lib/carriedScoreResolver';

/**
 * Regression guard for the Bulk Sign-off "active-stage reviewer can type
 * Achieved" fix. Before the fix, a row with `source = 'self'` (Self's
 * score carried forward into the Auditor column) was read-only for the
 * Auditor — only the admin Override checkbox unlocked it.
 */

function makeCell(overrides: Partial<CellPreview> = {}): CellPreview {
  return {
    submission_id: 'sub-1',
    employee_id: 'emp-1',
    employee_name: 'Sajid Raza',
    kpi_name: 'Timely Closure of Safety Observations',
    weightage: 2.5,
    score: 5,
    source: 'self',
    weightedImpact: 0.13,
    kra_name: 'ENSURE ZERO HARM WORKPLACE',
    uom: 'Number',
    target_value: null,
    achieved_current: null,
    isNa: false,
    stageScores: {
      self: 5, manager: null, skip_level: null, hr_pms: null,
      auditor: null, management: null, final: null,
    },
    ...overrides,
  };
}

function makePreview(cell: CellPreview): ImpactSummary {
  return {
    cells: [cell],
    perEmployee: [],
    totals: {
      cellCount: 1, employeeCount: 1, computedCount: 0, skippedCount: 0,
      overrideCount: 0, requiredUnfilled: 0, naCount: 0, weightedDelta: 0,
    },
  };
}

const kpiRule: KpiRule = {
  uom_type: 'numeric',
  uom: 'Number',
  weightage: 2.5,
  target_value: null,
  r0: '0', r1: '1', r2: '2', r3: '3', r4: '4', r5: '5',
  qualitative_options: null,
} as unknown as KpiRule;

describe('BulkSignoffPreview — reviewer-editable Achieved (sign-off mode)', () => {
  it('renders Achieved input for an active-stage reviewer even when prior score is carried forward', () => {
    const cell = makeCell({ source: 'self', score: 5 });
    render(
      <BulkSignoffPreview
        preview={makePreview(cell)}
        isLoading={false}
        ruleByKpiId={new Map([['kpi-1', kpiRule]])}
        kpiIdBySubmissionId={new Map([['sub-1', 'kpi-1']])}
        inputs={new Map()}
        onCellInputChange={vi.fn()}
        isOverride={false}
        stageLabel="Auditor"
        mode="signoff"
      />,
    );
    // Desktop table + mobile card both render the input; at least one input must exist.
    expect(screen.getAllByLabelText('Achieved value').length).toBeGreaterThan(0);
  });

  it('renders Achieved input on a "no data" row (legacy path still works)', () => {
    const cell = makeCell({ source: 'none', score: null });
    render(
      <BulkSignoffPreview
        preview={makePreview(cell)}
        isLoading={false}
        ruleByKpiId={new Map([['kpi-1', kpiRule]])}
        kpiIdBySubmissionId={new Map([['sub-1', 'kpi-1']])}
        inputs={new Map()}
        onCellInputChange={vi.fn()}
        isOverride={false}
        stageLabel="Auditor"
        mode="signoff"
      />,
    );
    expect(screen.getAllByLabelText('Achieved value').length).toBeGreaterThan(0);
  });

  it('approve-Final + non-admin keeps Achieved read-only (regression guard for §88)', () => {
    const cell = makeCell({ source: 'auditor', score: 5 });
    render(
      <BulkSignoffPreview
        preview={makePreview(cell)}
        isLoading={false}
        ruleByKpiId={new Map([['kpi-1', kpiRule]])}
        kpiIdBySubmissionId={new Map([['sub-1', 'kpi-1']])}
        inputs={new Map()}
        // Parent passes undefined in approve+non-admin mode; mirror that here.
        onCellInputChange={undefined}
        isOverride={false}
        stageLabel="Final"
        mode="approve"
      />,
    );
    expect(screen.queryByLabelText('Achieved value')).toBeNull();
  });
});