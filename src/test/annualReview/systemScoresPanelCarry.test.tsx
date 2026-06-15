import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SystemScoresPanel } from '@/components/annual-review/SystemScoresPanel';
import { AnnualReviewI18nProvider } from '@/components/annual-review/AnnualReviewI18nContext';

vi.mock('@/services/annualReview/carryKraScore', async () => {
  const actual = await vi.importActual<any>('@/services/annualReview/carryKraScore');
  return {
    ...actual,
    buildCarrySnapshot: vi.fn(async (_emp: string, _fy: number, _cfg: any, weight: number) => ({
      rating: 3.44,
      value: +(3.44 / 5 * weight).toFixed(2),
      maxValue: weight,
      fiscal_year: 2025,
      config: { aggregation: 'overall_avg', excludeNa: true },
      computed_at: new Date().toISOString(),
      monthly: actual.FY_MONTHS.map((m: string) => ({ month: m, avg: 3.44, kpiCount: 5 })),
      // Mock supplies the new derived fields too so the table can render them.
    })),
  };
});

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AnnualReviewI18nProvider currentLanguage="en" defaultLanguage="en" templateTranslations={{}}>
        {ui}
      </AnnualReviewI18nProvider>
    </QueryClientProvider>,
  );
}

describe('SystemScoresPanel — Carry KRA card', () => {
  it('renders Achieved / Out of / Rating once the snapshot resolves', async () => {
    wrap(
      <SystemScoresPanel
        systemScores={[{ id: 'sys1', name: 'Carry KRA', weight: 100, source: 'carry_kra', carry_config: { aggregation: 'overall_avg', excludeNa: true } } as any]}
        values={{}}
        employeeId="emp-1"
        fiscalYear={2025}
        readOnly
      />,
    );

    await waitFor(() => expect(screen.getByText('68.80')).toBeInTheDocument());
    expect(screen.getByText('Achieved')).toBeInTheDocument();
    expect(screen.getByText('Out of')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('3.44 / 5')).toBeInTheDocument();
  });
});