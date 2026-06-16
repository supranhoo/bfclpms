import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BulkApproveDialog } from '@/components/review/BulkApproveDialog';

vi.mock('@/components/ui/MultiFileUpload', () => ({
  MultiFileUpload: () => <div data-testid="mock-uploader" />,
}));

/**
 * Regression guard for POLICY §111.7.a.8 — Bulk "Save as Draft".
 *
 * Contract:
 *  - Draft button renders ONLY in sign-off mode AND only when the parent
 *    wires `onSaveDraft`. Terminal "approve" (Management/Final) stays binary.
 *  - Draft bypasses the 10-char remark minimum required for sign-off.
 *  - Draft button stays disabled until the reviewer has touched something
 *    (input/remark/evidence) — keeps the action from being a no-op.
 */
describe('BulkApproveDialog — Save as Draft', () => {
  const baseProps = {
    open: true,
    cellCount: 3,
    batchId: 'batch-1',
    uploaderUserId: 'user-1',
    isLoading: false,
    onCancel: vi.fn(),
    onConfirm: vi.fn(),
    mode: 'signoff' as const,
    stageLabel: 'Auditor',
  };

  it('hides the draft button when onSaveDraft is not provided', () => {
    render(<BulkApproveDialog {...baseProps} />);
    expect(screen.queryByRole('button', { name: /save as draft/i })).toBeNull();
  });

  it('renders the draft button in sign-off mode when handler is wired', () => {
    render(<BulkApproveDialog {...baseProps} onSaveDraft={vi.fn()} />);
    expect(screen.getByRole('button', { name: /save as draft/i })).toBeInTheDocument();
  });

  it('draft button is disabled until the reviewer types a remark or input', () => {
    const onSaveDraft = vi.fn();
    render(<BulkApproveDialog {...baseProps} onSaveDraft={onSaveDraft} />);
    const btn = screen.getByRole('button', { name: /save as draft/i });
    expect(btn).toBeDisabled();
    // Even a 3-char remark (well below the sign-off minimum) enables the draft.
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'wip' } });
    expect(btn).not.toBeDisabled();
  });

  it('clicking Save as Draft fires the draft handler with the typed remark, even below the 10-char sign-off minimum', () => {
    const onSaveDraft = vi.fn();
    const onConfirm = vi.fn();
    render(<BulkApproveDialog {...baseProps} onSaveDraft={onSaveDraft} onConfirm={onConfirm} />);
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'wip' } });
    // Sign-off primary stays disabled (still below the 10-char minimum)…
    expect(screen.getByRole('button', { name: /^Sign off /i })).toBeDisabled();
    // …but Save as Draft fires the draft handler with our short remark.
    fireEvent.click(screen.getByRole('button', { name: /save as draft/i }));
    expect(onSaveDraft).toHaveBeenCalledTimes(1);
    expect(onSaveDraft.mock.calls[0][0]).toMatchObject({
      reason: 'wip',
      batchId: 'batch-1',
    });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('does NOT render the draft button in approve (Management/Final) mode', () => {
    render(
      <BulkApproveDialog
        {...baseProps}
        mode="approve"
        stageLabel={undefined}
        onSaveDraft={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /save as draft/i })).toBeNull();
  });
});