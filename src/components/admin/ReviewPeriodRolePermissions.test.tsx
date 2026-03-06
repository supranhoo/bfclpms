import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ReviewPeriodRolePermissions from './ReviewPeriodRolePermissions';
import { ALL_APP_ROLES } from '@/lib/roles';
import { PERMISSION_KEYS, PERMISSION_LABELS } from '@/hooks/useReviewPeriodGovernance';

describe('ReviewPeriodRolePermissions', () => {
  const defaultProps = {
    locks: [],
    onSaveRoleLock: vi.fn(),
    saving: false,
  };

  it('renders all 7 roles', () => {
    render(<ReviewPeriodRolePermissions {...defaultProps} />);
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByText('Manager')).toBeInTheDocument();
    expect(screen.getByText('Employee')).toBeInTheDocument();
    expect(screen.getByText('Auditor')).toBeInTheDocument();
    expect(screen.getByText('Management')).toBeInTheDocument();
    expect(screen.getByText('HR PMS')).toBeInTheDocument();
    expect(screen.getByText('Skip Level')).toBeInTheDocument();
  });

  it('renders all 7 permission columns', () => {
    render(<ReviewPeriodRolePermissions {...defaultProps} />);
    PERMISSION_KEYS.forEach(perm => {
      expect(screen.getByText(PERMISSION_LABELS[perm])).toBeInTheDocument();
    });
  });

  it('save button is disabled initially (no dirty state)', () => {
    render(<ReviewPeriodRolePermissions {...defaultProps} />);
    const saveBtn = screen.getByText(/Save Permissions/);
    expect(saveBtn.closest('button')).toBeDisabled();
  });

  it('admin role shows Full Access badge', () => {
    render(<ReviewPeriodRolePermissions {...defaultProps} />);
    // Admin row should have "Full Access" badge
    const fullAccessBadges = screen.getAllByText('Full Access');
    expect(fullAccessBadges.length).toBeGreaterThanOrEqual(1);
  });
});
