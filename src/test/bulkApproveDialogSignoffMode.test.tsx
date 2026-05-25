import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BulkApproveDialog } from '@/components/review/BulkApproveDialog';

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
});