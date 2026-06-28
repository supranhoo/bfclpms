import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import OrganizationInfoCard from '@/components/profile/OrganizationInfoCard';

const baseInfo = {
  division: 'Support Function',
  businessUnit: 'Commercial',
  department: 'Commercial-HO',
  subBranch: null,
  designation: 'DGM',
  pmsGrade: 'AGM-SDGM',
  employeeCategory: 'AGM and above',
  employmentStatus: 'Probation',
  employeeCode: '102013',
  joiningDate: null as string | null,
};

describe('OrganizationInfoCard — Date of Joining source', () => {
  it('renders the provided joiningDate (doj) formatted as dd MMM yyyy', () => {
    const { getByText } = render(
      React.createElement(OrganizationInfoCard, { info: { ...baseInfo, joiningDate: '2026-05-15' } }),
    );
    expect(getByText('15 May 2026')).toBeTruthy();
  });

  it('shows em-dash placeholder when joiningDate is null (never falls back to created_at)', () => {
    const { getByText } = render(
      React.createElement(OrganizationInfoCard, { info: { ...baseInfo, joiningDate: null } }),
    );
    expect(getByText('—')).toBeTruthy();
  });
});
