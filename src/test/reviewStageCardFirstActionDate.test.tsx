import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { User } from 'lucide-react';
import { ReviewStageCard } from '@/components/review/ReviewStageCard';

const base = {
  icon: User,
  iconColor: 'blue' as const,
  title: 'Self',
  score: 5,
  rating: 'blue' as const,
  remarks: null,
  evidenceUrls: [],
  status: 'completed' as const,
};

describe('ReviewStageCard — admin-only first-action date (ADR-209)', () => {
  it('renders the gray date when the admin flag is on', () => {
    render(
      <ReviewStageCard {...base} firstActionAt="2026-06-05T08:30:00Z" showFirstActionDate />,
    );
    expect(screen.getByTestId('stage-first-action-date').textContent).toContain('1st:');
    expect(screen.getByTestId('stage-first-action-date').textContent).toContain('Jun 2026');
  });

  it('renders nothing for non-admin viewers', () => {
    render(
      <ReviewStageCard
        {...base}
        firstActionAt="2026-06-05T08:30:00Z"
        showFirstActionDate={false}
      />,
    );
    expect(screen.queryByTestId('stage-first-action-date')).toBeNull();
  });

  it('renders nothing when the date is unknown', () => {
    render(<ReviewStageCard {...base} firstActionAt={null} showFirstActionDate />);
    expect(screen.queryByTestId('stage-first-action-date')).toBeNull();
  });
});