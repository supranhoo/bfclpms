import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GovernanceLockBanner } from './GovernanceLockBanner';
import { ReviewPeriodPermissions } from '@/hooks/useReviewPeriodPermissions';

const openPerms: ReviewPeriodPermissions = {
  edit_kpi: true,
  submit_self_review: true,
  submit_manager_review: true,
  approve: true,
  edit_scores: true,
  add_comments: true,
  view_only: false,
  isLoading: false,
  periodStage: null,
};

describe('GovernanceLockBanner', () => {
  it('renders nothing when isLoading is true', () => {
    const { container } = render(
      <GovernanceLockBanner permissions={{ ...openPerms, isLoading: true }} viewLevel="employee" />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when all permissions are open', () => {
    const { container } = render(
      <GovernanceLockBanner permissions={openPerms} viewLevel="employee" />
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows destructive view-only alert', () => {
    render(
      <GovernanceLockBanner
        permissions={{ ...openPerms, view_only: true, periodStage: 'closed' }}
        viewLevel="employee"
      />
    );
    expect(screen.getByText(/view-only/i)).toBeInTheDocument();
    expect(screen.getByText(/closed/i)).toBeInTheDocument();
  });

  it('shows restriction warning for disabled scores and comments', () => {
    render(
      <GovernanceLockBanner
        permissions={{ ...openPerms, edit_scores: false, add_comments: false }}
        viewLevel="employee"
      />
    );
    expect(screen.getByText(/score editing/)).toBeInTheDocument();
    expect(screen.getByText(/comments/)).toBeInTheDocument();
  });

  it('shows "approval" restriction for management viewLevel', () => {
    render(
      <GovernanceLockBanner
        permissions={{ ...openPerms, approve: false }}
        viewLevel="management"
      />
    );
    expect(screen.getByText(/approval/)).toBeInTheDocument();
  });

  it('shows "forwarding" restriction for auditor viewLevel', () => {
    render(
      <GovernanceLockBanner
        permissions={{ ...openPerms, approve: false }}
        viewLevel="auditor"
      />
    );
    expect(screen.getByText(/forwarding/)).toBeInTheDocument();
  });

  it('shows "manager review" restriction for manager viewLevel', () => {
    render(
      <GovernanceLockBanner
        permissions={{ ...openPerms, submit_manager_review: false }}
        viewLevel="manager"
      />
    );
    expect(screen.getByText(/manager review/)).toBeInTheDocument();
  });
});
