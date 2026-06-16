import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BulkApproveDialog } from '@/components/review/BulkApproveDialog';
import type { ImpactSummary } from '@/lib/bulkSignoffImpact';
import type { KpiRule } from '@/lib/carriedScoreResolver';

vi.mock('@/components/ui/MultiFileUpload', () => ({
  MultiFileUpload: () => <div data-testid="mock-uploader" />,
}));

// Guards POLICY §111.7.a UX contract: stage sign-off must use sign-off copy
// and surface the acted stage so reviewers know which column gets the remark.
describe('BulkApproveDialog — sign-off mode', () => {
  const baseProps = {
    open: true,
    cellCount: 4,
    batchId: 'batch-1',
    uploaderUserId: 'user-1',
    isLoading: false,
    onCancel: vi.fn(),
    onConfirm: vi.fn(),
    mode: 'signoff' as const,
    stageLabel: 'HR PMS',
  };

  it('renders stage-aware title and button copy', () => {
    render(<BulkApproveDialog {...baseProps} />);
    expect(screen.getByText(/Bulk sign off 4 cells as HR PMS\?/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^Sign off 4 cells$/i }),
    ).toBeInTheDocument();
  });

  it('still requires a remark of at least 10 chars', () => {
    const onConfirm = vi.fn();
    render(<BulkApproveDialog {...baseProps} onConfirm={onConfirm} />);
    const btn = screen.getByRole('button', { name: /^Sign off 4 cells$/i });
    expect(btn).toBeDisabled();
    const ta = screen.getAllByRole('textbox')[0];
    fireEvent.change(ta, { target: { value: 'approved subject to audit' } });
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(onConfirm).toHaveBeenCalledWith({
      reason: 'approved subject to audit',
      attachmentUrls: [],
      batchId: 'batch-1',
    });
  });

  it('shows signing-off loading copy', () => {
    render(<BulkApproveDialog {...baseProps} isLoading={true} />);
    expect(screen.getByRole('button', { name: /signing off/i })).toBeDisabled();
  });

  // POLICY §111.7.a.7 — every active-stage reviewer (Manager / Skip-Level /
  // HR PMS / Auditor) MUST get editable Achvd inputs in sign-off mode. The
  // admin-only "Override stage score only" panel MUST stay hidden from them.
  it('non-admin reviewer sees editable Achvd inputs but no admin Override panel', () => {
    const preview: ImpactSummary = {
      cells: [{
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
      }],
      perEmployee: [],
      totals: {
        cellCount: 1, employeeCount: 1, computedCount: 0, skippedCount: 0,
        overrideCount: 0, requiredUnfilled: 0, naCount: 0, weightedDelta: 0,
      },
    };
    const kpiRule = {
      uom_type: 'numeric', uom: 'Number', weightage: 2.5, target_value: null,
      r0: '0', r1: '1', r2: '2', r3: '3', r4: '4', r5: '5',
      qualitative_options: null,
    } as unknown as KpiRule;

    render(
      <BulkApproveDialog
        {...baseProps}
        stageLabel="Auditor"
        preview={preview}
        ruleByKpiId={new Map([['kpi-1', kpiRule]])}
        kpiIdBySubmissionId={new Map([['sub-1', 'kpi-1']])}
        isAdmin={false}
      />,
    );
    // Achvd input must be editable for the reviewer even though source='self'
    // (Self's score is being carried forward into the Auditor column).
    expect(screen.getAllByLabelText('Achieved value').length).toBeGreaterThan(0);
    // Admin Override panel must NOT render for non-admins.
    expect(screen.queryByText(/Override .* score only \(admin\)/i)).toBeNull();
  });
});