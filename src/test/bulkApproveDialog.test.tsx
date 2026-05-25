import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BulkApproveDialog } from '@/components/review/BulkApproveDialog';

// MultiFileUpload talks to Supabase storage — stub it to a no-op dropzone.
vi.mock('@/components/ui/MultiFileUpload', () => ({
  MultiFileUpload: () => <div data-testid="mock-uploader" />,
}));

describe('BulkApproveDialog', () => {
  const baseProps = {
    open: true,
    cellCount: 7,
    batchId: 'batch-1',
    uploaderUserId: 'user-1',
    isLoading: false,
    onCancel: vi.fn(),
    onConfirm: vi.fn(),
  };

  it('disables Approve until remark is ≥10 chars', () => {
    const onConfirm = vi.fn();
    render(<BulkApproveDialog {...baseProps} onConfirm={onConfirm} />);

    const approveBtn = screen.getByRole('button', { name: /approve 7 cells/i });
    expect(approveBtn).toBeDisabled();

    const textarea = screen.getByPlaceholderText(/Approved after/i);
    fireEvent.change(textarea, { target: { value: 'too short' } }); // 9 chars
    expect(approveBtn).toBeDisabled();

    fireEvent.change(textarea, { target: { value: 'this is a long-enough remark' } });
    expect(approveBtn).not.toBeDisabled();

    fireEvent.click(approveBtn);
    expect(onConfirm).toHaveBeenCalledWith({
      reason: 'this is a long-enough remark',
      attachmentUrls: [],
      batchId: 'batch-1',
    });
  });

  it('shows loading state and blocks submit while pending', () => {
    const onConfirm = vi.fn();
    render(
      <BulkApproveDialog
        {...baseProps}
        isLoading={true}
        onConfirm={onConfirm}
      />,
    );
    const approveBtn = screen.getByRole('button', { name: /approving/i });
    expect(approveBtn).toBeDisabled();
    fireEvent.click(approveBtn);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('singularises label when only one cell is selected', () => {
    render(<BulkApproveDialog {...baseProps} cellCount={1} />);
    expect(
      screen.getByRole('button', { name: /approve 1 cell$/i }),
    ).toBeInTheDocument();
  });
});