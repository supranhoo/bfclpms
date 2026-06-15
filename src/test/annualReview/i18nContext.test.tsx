import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AnnualReviewI18nProvider } from '@/components/annual-review/AnnualReviewI18nContext';
import { AnnualReviewStageTracker } from '@/components/annual-review/AnnualReviewStageTracker';
import { AnnualReviewStatusBadge } from '@/components/annual-review/AnnualReviewStatusBadge';

describe('Annual Review i18n context wiring', () => {
  it('renders English stage labels by default (no provider)', () => {
    render(<AnnualReviewStageTracker status="pending_self" />);
    expect(screen.getByText('Self Review')).toBeInTheDocument();
    expect(screen.getByText('Manager')).toBeInTheDocument();
  });

  it('translates stage labels to Hindi when the provider is set to hi', () => {
    render(
      <AnnualReviewI18nProvider currentLanguage="hi" defaultLanguage="en">
        <AnnualReviewStageTracker status="pending_self" />
      </AnnualReviewI18nProvider>,
    );
    expect(screen.getByText('स्व मूल्यांकन')).toBeInTheDocument();
    expect(screen.getByText('प्रबंधक')).toBeInTheDocument();
  });

  it('translates the status badge into Hindi', () => {
    render(
      <AnnualReviewI18nProvider currentLanguage="hi" defaultLanguage="en">
        <AnnualReviewStatusBadge status="pending_self" />
      </AnnualReviewI18nProvider>,
    );
    expect(screen.getByText('स्व मूल्यांकन लंबित')).toBeInTheDocument();
  });

  it('falls back to english when current === default', () => {
    render(
      <AnnualReviewI18nProvider currentLanguage="en" defaultLanguage="en">
        <AnnualReviewStatusBadge status="pending_self" />
      </AnnualReviewI18nProvider>,
    );
    expect(screen.getByText('Self Review Pending')).toBeInTheDocument();
  });
});