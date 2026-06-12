import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SafetyActiveFilterChips } from '@/components/safety/SafetyActiveFilterChips';

describe('SafetyActiveFilterChips — Phase 6', () => {
  it('renders nothing when no chips are active', () => {
    const { container } = render(<SafetyActiveFilterChips chips={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders one chip per filter with label and value', () => {
    render(
      <SafetyActiveFilterChips
        chips={[
          { key: 'a', label: 'Status', value: 'reported', onRemove: () => {} },
          { key: 'b', label: 'BU', value: 'Plant A', onRemove: () => {} },
        ]}
      />,
    );
    expect(screen.getByText('reported')).toBeInTheDocument();
    expect(screen.getByText('Plant A')).toBeInTheDocument();
    expect(screen.getByText('Status:')).toBeInTheDocument();
  });

  it('invokes onRemove for the correct chip when X is clicked', () => {
    const onRemoveA = vi.fn();
    const onRemoveB = vi.fn();
    render(
      <SafetyActiveFilterChips
        chips={[
          { key: 'a', label: 'Status', value: 'reported', onRemove: onRemoveA },
          { key: 'b', label: 'BU', value: 'Plant A', onRemove: onRemoveB },
        ]}
      />,
    );
    fireEvent.click(screen.getByLabelText('Remove BU filter'));
    expect(onRemoveB).toHaveBeenCalledTimes(1);
    expect(onRemoveA).not.toHaveBeenCalled();
  });

  it('shows "Clear all" only when onClearAll is provided and fires once', () => {
    const onClear = vi.fn();
    render(
      <SafetyActiveFilterChips
        chips={[{ key: 'a', label: 'Status', value: 'reported', onRemove: () => {} }]}
        onClearAll={onClear}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});