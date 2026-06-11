import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { User } from 'lucide-react';
import { ReviewStageCard } from '@/components/review/ReviewStageCard';

/**
 * RCA Jun-2026 — Auditor saw "N/A" tiles for Self/Manager while the
 * `review_submissions` row actually existed (self=5, manager=5). Root
 * cause: the journey tile rendered "N/A" while the parent query was
 * still loading. Fix: parent passes `isLoading` to ReviewStageCard which
 * renders a Skeleton instead of the misleading N/A pill.
 */
describe('ReviewStageCard loading vs N/A contract', () => {
  const base = {
    icon: User,
    iconColor: 'blue' as const,
    title: 'Self',
    rating: null,
    remarks: null,
    evidenceUrls: [],
    status: 'completed' as const,
  };

  it('renders a skeleton (not N/A) while isLoading is true and score is null', () => {
    render(<ReviewStageCard {...base} score={null} isLoading />);
    expect(screen.getByTestId('stage-score-skeleton')).toBeTruthy();
    expect(screen.queryByText('N/A')).toBeNull();
  });

  it('renders existing N/A pill when not loading and score is null (regression guard)', () => {
    render(<ReviewStageCard {...base} score={null} isNA />);
    expect(screen.getByText('N/A')).toBeTruthy();
    expect(screen.queryByTestId('stage-score-skeleton')).toBeNull();
  });

  it('renders the real rating once data has loaded', () => {
    render(<ReviewStageCard {...base} score={5} />);
    expect(screen.getByText(/Rating:\s*5/)).toBeTruthy();
    expect(screen.queryByTestId('stage-score-skeleton')).toBeNull();
  });

  it('pending stages stay muted even while loading (no skeleton flash)', () => {
    render(<ReviewStageCard {...base} status="pending" score={null} isLoading />);
    expect(screen.queryByTestId('stage-score-skeleton')).toBeNull();
    expect(screen.getByText('Pending')).toBeTruthy();
  });
});