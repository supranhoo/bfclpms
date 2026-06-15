import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TemplateEditorDialog } from '@/components/annual-review/TemplateEditorDialog';

vi.mock('@/services/annualReview/annualReviewService', () => ({
  upsertTemplate: vi.fn(),
  searchActiveEmployees: vi.fn(async () => []),
}));

vi.mock('@/services/annualReview/carryKraScore', async () => {
  const actual = await vi.importActual<any>('@/services/annualReview/carryKraScore');
  return { ...actual, buildCarrySnapshot: vi.fn(async () => ({ value: 0, fiscal_year: 2025, config: { aggregation: 'overall_avg', excludeNa: true }, computed_at: '', monthly: [] })) };
});

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('TemplateEditorDialog — Carry KRA shortcut', () => {
  it('renders the "Add Carry KRA Score" shortcut when system_scores is empty, and clicking it adds a pre-configured carry_kra row', () => {
    wrap(
      <TemplateEditorDialog
        open
        onOpenChange={() => {}}
        template={null}
        onSaved={() => {}}
      />,
    );

    const cta = screen.getByRole('button', { name: /Add Carry KRA Score/i });
    expect(cta).toBeInTheDocument();
    fireEvent.click(cta);

    // After click: row appears with the source selector and the preview collapsible trigger
    expect(screen.getByText(/Carry KRA Score \(auto-fetched\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Preview employee mapping/i)).toBeInTheDocument();
  });
});