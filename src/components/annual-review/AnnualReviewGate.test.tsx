import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AnnualReviewGate } from './AnnualReviewGate';

vi.mock('@/hooks/useAnnualReview', () => ({
  useAnnualReviewFlag: vi.fn(),
}));

import { useAnnualReviewFlag } from '@/hooks/useAnnualReview';

function renderAt(path = '/annual-review') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/annual-review"
          element={<AnnualReviewGate><div>PILOT_CONTENT</div></AnnualReviewGate>}
        />
        <Route path="/dashboard" element={<div>DASHBOARD</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AnnualReviewGate', () => {
  beforeEach(() => vi.mocked(useAnnualReviewFlag).mockReset());

  it('renders children when the flag is enabled', () => {
    vi.mocked(useAnnualReviewFlag).mockReturnValue({ data: true, isLoading: false, isError: false } as never);
    renderAt();
    expect(screen.getByText('PILOT_CONTENT')).toBeInTheDocument();
  });

  it('redirects to /dashboard when the flag is disabled', () => {
    vi.mocked(useAnnualReviewFlag).mockReturnValue({ data: false, isLoading: false, isError: false } as never);
    renderAt();
    expect(screen.getByText('DASHBOARD')).toBeInTheDocument();
    expect(screen.queryByText('PILOT_CONTENT')).not.toBeInTheDocument();
  });

  it('shows loading state while the flag query is pending (no flash-redirect)', () => {
    vi.mocked(useAnnualReviewFlag).mockReturnValue({ data: undefined, isLoading: true, isError: false } as never);
    renderAt();
    expect(screen.getByText(/checking access/i)).toBeInTheDocument();
    expect(screen.queryByText('PILOT_CONTENT')).not.toBeInTheDocument();
    expect(screen.queryByText('DASHBOARD')).not.toBeInTheDocument();
  });

  it('fails closed on error (redirects)', () => {
    vi.mocked(useAnnualReviewFlag).mockReturnValue({ data: undefined, isLoading: false, isError: true } as never);
    renderAt();
    expect(screen.getByText('DASHBOARD')).toBeInTheDocument();
  });
});