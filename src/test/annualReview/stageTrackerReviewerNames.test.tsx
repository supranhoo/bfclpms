import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AnnualReviewStageTracker } from '@/components/annual-review/AnnualReviewStageTracker';
import { buildReviewerNamesByStage } from '@/lib/annualReview/reviewerNames';

describe('AnnualReviewStageTracker reviewer-names visibility', () => {
  it('omits the name line when reviewerNamesByStage is undefined (default OFF)', () => {
    render(<AnnualReviewStageTracker status="pending_self" />);
    expect(screen.queryByText('— Unassigned')).not.toBeInTheDocument();
  });

  it('renders mapped names and "Unassigned" placeholders when provided', () => {
    const names = {
      self: 'Asha Patel (E1)',
      manager: 'Ramesh Kumar (E2)',
      skip_manager: null,
      dept_head: 'Neha Singh (E3)',
      bu_head: null,
      hr: 'HR Lead (E9)',
    } as const;
    render(<AnnualReviewStageTracker status="pending_manager" reviewerNamesByStage={names} />);
    expect(screen.getByText('Asha Patel (E1)')).toBeInTheDocument();
    expect(screen.getByText('Ramesh Kumar (E2)')).toBeInTheDocument();
    expect(screen.getByText('Neha Singh (E3)')).toBeInTheDocument();
    expect(screen.getByText('HR Lead (E9)')).toBeInTheDocument();
    expect(screen.getAllByText('— Unassigned').length).toBeGreaterThanOrEqual(2);
  });

  it('buildReviewerNamesByStage uses formatted profile labels and returns null for empty slots', () => {
    const map = buildReviewerNamesByStage(
      {
        employee_id: 'u-emp',
        manager_id: 'u-mgr',
        skip_id: null,
        dept_head_id: 'u-dept',
        bu_head_id: null,
        hr_id: null,
      },
      [
        { id: 'u-emp', full_name: 'Asha Patel', email: null, employee_code: 'E1' },
        { id: 'u-mgr', full_name: 'Ramesh Kumar', email: null, employee_code: 'E2' },
        { id: 'u-dept', full_name: 'Neha Singh', email: null, employee_code: 'E3' },
      ],
    );
    expect(map.self).toBe('Asha Patel (E1)');
    expect(map.manager).toBe('Ramesh Kumar (E2)');
    expect(map.dept_head).toBe('Neha Singh (E3)');
    expect(map.skip_manager).toBeNull();
    expect(map.bu_head).toBeNull();
    expect(map.hr).toBeNull();
  });
});