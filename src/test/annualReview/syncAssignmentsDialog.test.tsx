import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { SyncAssignmentsDialog } from '@/components/annual-review/SyncAssignmentsDialog';
import type { SeededConflict } from '@/services/annualReview/formMapping';

function mk(id: string, code: string, name: string, status: SeededConflict['overall_status'], eligible: boolean): SeededConflict {
  return {
    instance_id: id,
    employee_id: `emp-${id}`,
    employee_code: code,
    full_name: name,
    current_template_id: 'old-tpl',
    current_template_name: 'Old Template',
    overall_status: status,
    eligible_for_reassign: eligible,
  };
}

const eligibleRow = mk('i1', '100', 'Alice', 'pending_self', true);
const pastSelfRow = mk('i2', '101', 'Bob', 'pending_dept', false);

describe('SyncAssignmentsDialog — single-action UX', () => {
  it('mixed conflicts: submit disabled until reason ≥ 10 chars AND RESET typed, then splits ids correctly', () => {
    const onSyncAll = vi.fn();
    render(
      <SyncAssignmentsDialog
        open
        onOpenChange={() => {}}
        conflicts={[eligibleRow, pastSelfRow]}
        targetTemplateName="New Tpl"
        onSyncAll={onSyncAll}
        submitting={false}
      />,
    );

    const submit = screen.getByRole('button', { name: /Sync all 2/i });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Reason/i), {
      target: { value: 'template updated; refill needed' },
    });
    // Still disabled without RESET gate.
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Type/i), { target: { value: 'RESET' } });
    expect(submit).not.toBeDisabled();

    fireEvent.click(submit);
    expect(onSyncAll).toHaveBeenCalledTimes(1);
    expect(onSyncAll).toHaveBeenCalledWith({
      eligibleInstanceIds: ['i1'],
      resetInstanceIds: ['i2'],
      reason: 'template updated; refill needed',
    });
  });

  it('all-eligible conflicts: no RESET gate, reason ≥ 3 chars is enough', () => {
    const onSyncAll = vi.fn();
    render(
      <SyncAssignmentsDialog
        open
        onOpenChange={() => {}}
        conflicts={[eligibleRow]}
        targetTemplateName="New Tpl"
        onSyncAll={onSyncAll}
        submitting={false}
      />,
    );

    // No RESET input in the DOM.
    expect(screen.queryByLabelText(/Type/i)).toBeNull();

    fireEvent.change(screen.getByLabelText(/Reason/i), { target: { value: 'abc' } });
    const submit = screen.getByRole('button', { name: /Sync all 1/i });
    expect(submit).not.toBeDisabled();

    fireEvent.click(submit);
    expect(onSyncAll).toHaveBeenCalledWith({
      eligibleInstanceIds: ['i1'],
      resetInstanceIds: [],
      reason: 'abc',
    });
  });

  it('shows destructive badge on past-self rows', () => {
    render(
      <SyncAssignmentsDialog
        open
        onOpenChange={() => {}}
        conflicts={[eligibleRow, pastSelfRow]}
        targetTemplateName="New Tpl"
        onSyncAll={() => {}}
        submitting={false}
      />,
    );
    const bobRow = screen.getByText('Bob').closest('tr')!;
    expect(within(bobRow).getByText(/reset/i)).toBeInTheDocument();
    const aliceRow = screen.getByText('Alice').closest('tr')!;
    expect(within(aliceRow).getByText(/move/i)).toBeInTheDocument();
  });
});