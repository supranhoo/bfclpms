import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BulkApproveDialog } from '@/components/review/BulkApproveDialog';
import type { ImpactSummary } from '@/lib/bulkSignoffImpact';

vi.mock('@/components/ui/MultiFileUpload', () => ({
  MultiFileUpload: () => <div data-testid="mock-uploader" />,
}));

const preview: ImpactSummary = {
  cells: [
    {
      submission_id: 's1',
      employee_id: 'e1',
      employee_name: 'Alice',
      kpi_name: 'KPI A',
      weightage: 50,
      score: 4,
      source: 'auditor',
      weightedImpact: 2,
      kra_name: 'KRA-1',
      uom: '%',
      target_value: 100,
      achieved_current: 95,
      stageScores: {
        self: 3, manager: 3.5, skip_level: 3.5, hr_pms: 4, auditor: 4, management: null, final: 4,
      },
    },
  ],
  perEmployee: [{
    employee_id: 'e1', employee_name: 'Alice', cellsInBatch: 1, batchWeightSum: 50,
    currentOverall: 4, projectedOverall: 4, delta: 0, skippedInBatch: 0,
    selfAvg: 3, managerAvg: 3.5,
  }],
  totals: {
    cellCount: 1, employeeCount: 1, computedCount: 0,
    skippedCount: 0, overrideCount: 0, requiredUnfilled: 0, weightedDelta: 0,
  },
};

// Guards parity contract: Management's Bulk Approve dialog mirrors the
// Sign-off shell — wide layout, all stage scores visible, Final column
// highlighted — but never renders the admin override toggle.
describe('BulkApproveDialog — approve mode (Management parity)', () => {
  const baseProps = {
    open: true,
    cellCount: 1,
    batchId: 'batch-1',
    uploaderUserId: 'user-1',
    isLoading: false,
    onCancel: vi.fn(),
    onConfirm: vi.fn(),
    mode: 'approve' as const,
    preview,
    isAdmin: true,
  };

  it('renders the wide preview matrix with stage columns', () => {
    render(<BulkApproveDialog {...baseProps} />);
    expect(screen.getByText(/Bulk approve 1 cell\?/i)).toBeInTheDocument();
    expect(screen.getByText('Self')).toBeInTheDocument();
    expect(screen.getByText('Manager')).toBeInTheDocument();
    expect(screen.getByText('HR PMS')).toBeInTheDocument();
    expect(screen.getByText('Auditor')).toBeInTheDocument();
    expect(screen.getByText('Final')).toBeInTheDocument();
  });

  it('never renders the admin override toggle in approve mode', () => {
    render(<BulkApproveDialog {...baseProps} />);
    expect(screen.queryByText(/Override .* score only \(admin\)/i)).not.toBeInTheDocument();
  });

  it('renders POLICY §88 fallback copy in the legend', () => {
    render(<BulkApproveDialog {...baseProps} />);
    expect(screen.getByText(/POLICY §88/i)).toBeInTheDocument();
  });
});