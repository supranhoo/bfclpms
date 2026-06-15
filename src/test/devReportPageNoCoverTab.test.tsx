import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import DevelopmentReport from '@/pages/reports/DevelopmentReport';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ effectiveRole: 'admin', user: { id: 'u1' } }),
}));
vi.mock('@/hooks/useReportAccess', () => ({
  useReportAccess: () => ({ canDownload: () => true, canView: () => true }),
}));
vi.mock('@/hooks/useDevReportEntries', () => ({
  monthBounds: (m?: string | null) => (m ? { from: `${m}-01`, toExclusive: `${m}-02` } : null),
  formatEntryDateCell: () => '',
  useDevReportEntries: () => ({ data: [], isLoading: false }),
  useDevReportSummary: () => ({
    data: { feature_count: 0, bug_count: 0, timeline_count: 0, min_entry_date: '2026-02-03', max_entry_date: '2026-06-15' },
    isLoading: false,
  }),
  useDevReportMonths: () => ({ data: ['2026-06', '2026-05'] }),
  useDeleteDevReportEntry: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({ select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) }) },
}));

function renderPage(initialPath = '/reports/dev-report') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialPath]}>
        <DevelopmentReport />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DevelopmentReport — Cover tab removed', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does NOT render a Cover tab trigger', () => {
    renderPage();
    expect(screen.queryByRole('tab', { name: /cover/i })).toBeNull();
  });

  it('defaults the active tab to Features', () => {
    renderPage();
    const featuresTab = screen.getByRole('tab', { name: /features/i });
    expect(featuresTab.getAttribute('aria-selected')).toBe('true');
  });

  it('Reporting Period reflects the selected month, not global min/max', () => {
    renderPage('/reports/dev-report?month=2026-03');
    // Use a substring matcher because the label and the value are split across nodes.
    expect(screen.getByText(/Mar 2026/i)).toBeTruthy();
    expect(screen.getByText(/2026-03-01\s*–\s*2026-03-31/)).toBeTruthy();
  });

  it('Reporting Period shows "All months" when no filter is selected', () => {
    renderPage();
    // "All months" appears once in the filter dropdown and once in the period card
    expect(screen.getAllByText(/All months/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/2026-02-03\s*–\s*2026-06-15/)).toBeTruthy();
  });
});
