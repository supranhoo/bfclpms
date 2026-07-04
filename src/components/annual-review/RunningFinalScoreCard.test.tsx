import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RunningFinalScoreCard } from './RunningFinalScoreCard';

describe('RunningFinalScoreCard', () => {
  it('renders nothing when no stage is locked', () => {
    const { container } = render(
      <RunningFinalScoreCard
        running={{
          score_0_100: null,
          scaled_0_5: null,
          contributing: [],
          pending: ['self', 'manager'],
          hasLockedStage: false,
        }}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows score, /5 badge, contributing/pending counts and pending labels', () => {
    render(
      <RunningFinalScoreCard
        running={{
          score_0_100: 74.2857,
          scaled_0_5: 3.7143,
          contributing: ['self', 'manager', 'skip_manager', 'dept_head'],
          pending: ['bu_head', 'hr'],
          hasLockedStage: true,
        }}
      />,
    );
    expect(screen.getByText(/74\.3/)).toBeInTheDocument();
    expect(screen.getByText(/3\.71/)).toBeInTheDocument();
    expect(screen.getByText(/stages submitted so far/)).toBeInTheDocument();
    expect(screen.getByText(/BU Head/)).toBeInTheDocument();
    expect(screen.getByText(/HR/)).toBeInTheDocument();
  });
});