import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CarryKraMappingPreview } from '@/components/annual-review/CarryKraMappingPreview';
import type { CarryKraConfig } from '@/types/annualReview';

vi.mock('@/services/annualReview/carryKraScore', async () => {
  const actual = await vi.importActual<any>('@/services/annualReview/carryKraScore');
  return {
    ...actual,
    buildCarrySnapshot: vi.fn(async () => ({
      value: 7.5,
      fiscal_year: 2025,
      config: { aggregation: 'overall_avg', excludeNa: true } as CarryKraConfig,
      computed_at: new Date().toISOString(),
      monthly: actual.FY_MONTHS.map((m: string, i: number) => ({
        month: m,
        kpiCount: i % 3 === 0 ? 0 : 5,
        avg: i % 3 === 0 ? null : 7 + (i % 5) * 0.5,
      })),
    })),
  };
});

vi.mock('@/services/annualReview/annualReviewService', () => ({
  searchActiveEmployees: vi.fn(async () => [
    { id: 'u1', full_name: 'Asha Rao', employee_code: 'E001', designation: 'Welder' },
  ]),
}));

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('CarryKraMappingPreview', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not call buildCarrySnapshot before an employee is picked', async () => {
    const svc = await import('@/services/annualReview/carryKraScore');
    wrap(<CarryKraMappingPreview cfg={{ aggregation: 'overall_avg', excludeNa: true }} />);
    fireEvent.click(screen.getByText(/Preview employee mapping/i));
    await waitFor(() => expect(screen.getByText(/Pick an employee/i)).toBeInTheDocument());
    expect(svc.buildCarrySnapshot).not.toHaveBeenCalled();
  });
});