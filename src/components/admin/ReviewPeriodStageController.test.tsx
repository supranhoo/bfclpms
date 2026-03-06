import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ReviewPeriodStageController from './ReviewPeriodStageController';
import { GOVERNANCE_STAGES, STAGE_LABELS } from '@/hooks/useReviewPeriodGovernance';

describe('ReviewPeriodStageController', () => {
  const defaultProps = {
    stageHistory: [],
    onAdvanceStage: vi.fn(),
    isPending: false,
  };

  it('renders all 6 stage labels in pipeline', () => {
    render(<ReviewPeriodStageController {...defaultProps} currentStage="planning" />);
    GOVERNANCE_STAGES.forEach(stage => {
      expect(screen.getAllByText(STAGE_LABELS[stage]).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('advance button is disabled when at closed stage', () => {
    render(<ReviewPeriodStageController {...defaultProps} currentStage="closed" />);
    const advBtn = screen.getByText(/Advance to/);
    expect(advBtn.closest('button')).toBeDisabled();
  });

  it('revert button is disabled when at planning stage', () => {
    render(<ReviewPeriodStageController {...defaultProps} currentStage="planning" />);
    const revBtn = screen.getByText(/Revert to/);
    expect(revBtn.closest('button')).toBeDisabled();
  });

  it('calls onAdvanceStage with next stage', () => {
    const handler = vi.fn();
    render(<ReviewPeriodStageController {...defaultProps} currentStage="planning" onAdvanceStage={handler} />);
    fireEvent.click(screen.getByText(/Advance to Self Review/));
    expect(handler).toHaveBeenCalledWith({ newStage: 'self_review', reason: undefined });
  });

  it('calls onAdvanceStage with previous stage on revert', () => {
    const handler = vi.fn();
    render(<ReviewPeriodStageController {...defaultProps} currentStage="manager_review" onAdvanceStage={handler} />);
    fireEvent.click(screen.getByText(/Revert to Self Review/));
    expect(handler).toHaveBeenCalledWith({ newStage: 'self_review', reason: undefined });
  });

  it('shows closed-stage warning when stage is closed', () => {
    render(<ReviewPeriodStageController {...defaultProps} currentStage="closed" />);
    expect(screen.getByText(/This period is closed/)).toBeInTheDocument();
  });

  it('does not show closed-stage warning for other stages', () => {
    render(<ReviewPeriodStageController {...defaultProps} currentStage="planning" />);
    expect(screen.queryByText(/This period is closed/)).toBeNull();
  });
});
