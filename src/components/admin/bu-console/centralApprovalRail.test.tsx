/**
 * ADR-302 — the rail must offer Approve / Send back only to the actor whose
 * step is current. Everyone else sees the ladder read-only.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CentralApprovalRail } from './CentralApprovalRail';
import type {
  CentralActor, CentralChainStep, CentralDecision, CentralValueRow,
} from '@/lib/review/centralApprovalModel';

vi.mock('@/hooks/useOrgKpiCentralWorkflow', () => ({
  useOrgKpiDecide: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

const steps: CentralChainStep[] = [
  { id: 's1', step_no: 1, step_kind: 'provider', label: 'Data provider', approver_id: 'prov', approver_name: 'Anita', approver_role: null, effective_from: '2026-07-01' },
  { id: 's2', step_no: 2, step_kind: 'approver', label: 'RM1', approver_id: 'rm1', approver_name: 'Rakesh', approver_role: null, effective_from: '2026-07-01' },
  { id: 's3', step_no: 3, step_kind: 'approver', label: 'BU Head', approver_id: 'bu1', approver_name: 'Umesh', approver_role: null, effective_from: '2026-07-01' },
];

const row: CentralValueRow = {
  id: 'okv-1', achieved_value: 104320, target_value: 100000, remarks: null, is_na: false,
  workflow_stage: 'in_approval', current_step: 2, submitted_at: '2026-08-15T00:00:00.000Z',
  propagation_mode: 'central_fed', sent_back_reason: null, sent_back_at: null,
  updated_at: '2026-08-15T00:00:00.000Z',
};

const decisions: CentralDecision[] = [];
const actor = (over: Partial<CentralActor>): CentralActor =>
  ({ userId: 'x', roles: [], isAdmin: false, isDataOwner: false, ...over });

describe('CentralApprovalRail', () => {
  it('shows the actions to the current step holder', () => {
    render(
      <CentralApprovalRail steps={steps} row={row} decisions={decisions} actor={actor({ userId: 'rm1' })} />,
    );
    expect(screen.getByRole('button', { name: /approve this step/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send back/i })).toBeInTheDocument();
  });

  it('hides the actions from a later approver', () => {
    render(
      <CentralApprovalRail steps={steps} row={row} decisions={decisions} actor={actor({ userId: 'bu1' })} />,
    );
    expect(screen.queryByRole('button', { name: /approve this step/i })).not.toBeInTheDocument();
    expect(screen.getByText('BU Head')).toBeInTheDocument();
  });

  it('renders skeletons while loading', () => {
    const { container } = render(
      <CentralApprovalRail steps={steps} row={row} decisions={decisions} actor={actor({ userId: 'rm1' })} isLoading />,
    );
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
  });
});
