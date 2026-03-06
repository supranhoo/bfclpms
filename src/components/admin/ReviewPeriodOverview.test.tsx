import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ReviewPeriodOverview from './ReviewPeriodOverview';

const mockPeriod = {
  id: 'p1',
  period_name: 'H1',
  review_year: 2026,
  current_stage: 'manager_review',
  stage_started_at: '2026-02-01T10:00:00Z',
  completion_percentage: 65,
  is_locked: false,
  kpi_count: 42,
};

describe('ReviewPeriodOverview', () => {
  it('renders period name and year', () => {
    render(
      <ReviewPeriodOverview
        period={mockPeriod}
        globalLockActive={false}
        onToggleGlobalLock={() => {}}
        lockPending={false}
      />
    );
    expect(screen.getByText('H1 2026')).toBeInTheDocument();
  });

  it('renders current stage badge with correct label', () => {
    render(
      <ReviewPeriodOverview
        period={mockPeriod}
        globalLockActive={false}
        onToggleGlobalLock={() => {}}
        lockPending={false}
      />
    );
    const matches = screen.getAllByText('Manager Review');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('shows correct progress fraction', () => {
    render(
      <ReviewPeriodOverview
        period={mockPeriod}
        globalLockActive={false}
        onToggleGlobalLock={() => {}}
        lockPending={false}
      />
    );
    // manager_review is index 2, so 3/6
    expect(screen.getByText('3/6')).toBeInTheDocument();
  });

  it('shows global lock button with Locked state', () => {
    render(
      <ReviewPeriodOverview
        period={mockPeriod}
        globalLockActive={true}
        onToggleGlobalLock={() => {}}
        lockPending={false}
      />
    );
    expect(screen.getByText(/Locked — Click to Unlock/)).toBeInTheDocument();
  });

  it('shows global lock button with Open state', () => {
    render(
      <ReviewPeriodOverview
        period={mockPeriod}
        globalLockActive={false}
        onToggleGlobalLock={() => {}}
        lockPending={false}
      />
    );
    expect(screen.getByText(/Open — Click to Lock/)).toBeInTheDocument();
  });

  it('calls onToggleGlobalLock when button clicked', () => {
    const handler = vi.fn();
    render(
      <ReviewPeriodOverview
        period={mockPeriod}
        globalLockActive={false}
        onToggleGlobalLock={handler}
        lockPending={false}
      />
    );
    fireEvent.click(screen.getByText(/Open — Click to Lock/));
    expect(handler).toHaveBeenCalledWith(true);
  });

  it('renders completion percentage from period data', () => {
    render(
      <ReviewPeriodOverview
        period={mockPeriod}
        globalLockActive={false}
        onToggleGlobalLock={() => {}}
        lockPending={false}
      />
    );
    expect(screen.getByText('65%')).toBeInTheDocument();
  });
});
