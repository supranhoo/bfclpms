import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SystemScoresPanel } from '@/components/annual-review/SystemScoresPanel';
import type { EligibilityCriterion } from '@/types/annualReview';

const criteria: EligibilityCriterion[] = [
  { id: 'att',  name: 'Attendance',        type: 'number',  operator: 'gte',    expected_value: 90,    description: 'At least 90%' },
  { id: 'disc', name: 'Disciplinary case', type: 'boolean', operator: 'equals', expected_value: false, description: 'No open case' },
];

function renderPanel(props: Partial<React.ComponentProps<typeof SystemScoresPanel>>) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SystemScoresPanel systemScores={[]} values={{}} eligibility={criteria} {...props} />
    </QueryClientProvider>,
  );
}

describe('SystemScoresPanel — eligibility always visible', () => {
  it('renders the criteria table when all criteria pass (regression lock)', () => {
    renderPanel({ eligibilityInputs: { att: 95, disc: false } });
    const section = screen.getByTestId('eligibility-section');
    expect(section).toHaveAttribute('data-status', 'met');
    expect(screen.getByText(/All eligibility criteria met/i)).toBeInTheDocument();
    expect(screen.getByText('Attendance')).toBeInTheDocument();
    expect(screen.getByText('Disciplinary case')).toBeInTheDocument();
  });

  it('marks section as failed when a criterion is not met', () => {
    renderPanel({ eligibilityInputs: { att: 80, disc: false } });
    const section = screen.getByTestId('eligibility-section');
    expect(section).toHaveAttribute('data-status', 'fail');
    expect(screen.getByText(/Eligibility criteria not met/i)).toBeInTheDocument();
  });

  it('shows pending state when an input is missing', () => {
    renderPanel({ eligibilityInputs: { disc: false } });
    const section = screen.getByTestId('eligibility-section');
    expect(section).toHaveAttribute('data-status', 'pending');
    expect(screen.getByText(/Eligibility inputs pending/i)).toBeInTheDocument();
  });

  it('hides the whole block when no eligibility criteria are defined', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <SystemScoresPanel systemScores={[]} values={{}} eligibility={[]} />
      </QueryClientProvider>,
    );
    expect(screen.queryByTestId('eligibility-section')).not.toBeInTheDocument();
  });
});