import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppraisalCompositionCard } from './AppraisalCompositionCard';
import type { ScoreComposition } from '@/lib/annualReview/scoringComposition';

const base: ScoreComposition = {
  systemActual: 0,
  systemMax: 0,
  criteriaActual: 0,
  criteriaMax: 0,
  criteriaRaw: 0,
  criteriaRawMax: 0,
  overallActual: 0,
  overallMax: 100,
  hasSystem: false,
  hasCriteria: false,
};

describe('AppraisalCompositionCard (full)', () => {
  it('renders all 3 columns when System and Criteria both contribute', () => {
    render(
      <AppraisalCompositionCard
        composition={{ ...base, systemActual: 60, systemMax: 70, criteriaActual: 25, criteriaMax: 30, overallActual: 85 }}
      />,
    );
    expect(screen.getByText('System Score')).toBeInTheDocument();
    expect(screen.getByText('Criteria Score')).toBeInTheDocument();
    expect(screen.getAllByText('Overall').length).toBeGreaterThanOrEqual(1);
  });

  it('collapses to a single Overall column when only System contributes', () => {
    render(
      <AppraisalCompositionCard
        composition={{ ...base, systemActual: 99, systemMax: 100, overallActual: 99 }}
      />,
    );
    expect(screen.queryByText('System Score')).not.toBeInTheDocument();
    expect(screen.queryByText('Criteria Score')).not.toBeInTheDocument();
    expect(screen.getByText('Overall')).toBeInTheDocument();
    expect(screen.getByText('Auto-fetched (e.g. KRA)')).toBeInTheDocument();
  });

  it('collapses to a single Overall column when only Criteria contributes', () => {
    render(
      <AppraisalCompositionCard
        composition={{ ...base, criteriaActual: 80, criteriaMax: 100, overallActual: 80 }}
      />,
    );
    expect(screen.queryByText('System Score')).not.toBeInTheDocument();
    expect(screen.queryByText('Criteria Score')).not.toBeInTheDocument();
    expect(screen.getByText('Overall')).toBeInTheDocument();
    expect(screen.getByText('Rated against criteria')).toBeInTheDocument();
  });

  it('shows "No score configured" hint when neither contributes', () => {
    render(<AppraisalCompositionCard composition={base} />);
    expect(screen.getByText('No score configured')).toBeInTheDocument();
  });
});