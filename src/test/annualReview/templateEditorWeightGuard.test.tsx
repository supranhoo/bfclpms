import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TemplateEditorDialog } from '@/components/annual-review/TemplateEditorDialog';
import type { AnnualReviewTemplate } from '@/types/annualReview';

const upsertTemplate = vi.fn(async () => ({ id: 't1' }));
vi.mock('@/services/annualReview/annualReviewService', () => ({
  upsertTemplate: (...a: unknown[]) => upsertTemplate(...a),
  searchActiveEmployees: vi.fn(async () => []),
}));

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

function makeTemplate(overrides: Partial<AnnualReviewTemplate> = {}): AnnualReviewTemplate {
  return {
    id: 't1',
    name: 'T',
    description: null,
    is_active: true,
    created_by: null,
    created_at: '',
    updated_at: '',
    sections: {
      settings: { enable_multilingual: false, default_language: 'en', available_languages: ['en'] },
      system_scores: [{ id: 's1', name: 'Safety', weight: 30, source: 'manual' }],
      criteria: [
        { id: 'c1', name: 'Attendance', weight: 70, reviewer_stages: ['self'], options: [] },
      ],
      eligibility_criteria: [],
      self_review_fields: [],
      translations: {},
    },
    ...overrides,
  };
}

describe('TemplateEditorDialog — weight save guard', () => {
  beforeEach(() => upsertTemplate.mockClear());

  it('Active + total 100 → Save enabled, no blocker panel', () => {
    wrap(<TemplateEditorDialog open onOpenChange={() => {}} template={makeTemplate()} onSaved={() => {}} />);
    expect(screen.queryByText(/Cannot save as Active/i)).not.toBeInTheDocument();
    const save = screen.getByRole('button', { name: /Save Template/i });
    expect(save).not.toBeDisabled();
  });

  it('Active + total 98 → Save disabled, blocker visible, "Save as Draft" appears', () => {
    const t = makeTemplate();
    t.sections.criteria![0].weight = 68; // total 98
    wrap(<TemplateEditorDialog open onOpenChange={() => {}} template={t} onSaved={() => {}} />);
    expect(screen.getByText(/Cannot save as Active/i)).toBeInTheDocument();
    expect(screen.getByText(/must be exactly 100%/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save Template/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Save as Draft/i })).toBeInTheDocument();
  });

  it('Active + criterion weight 0 → Save disabled with zero-weight blocker', () => {
    const t = makeTemplate();
    t.sections.system_scores![0].weight = 100;
    t.sections.criteria![0].weight = 0; // total still 100 via system, but criterion is 0
    wrap(<TemplateEditorDialog open onOpenChange={() => {}} template={t} onSaved={() => {}} />);
    expect(screen.getByText(/Every criterion must have a weight greater than 0/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save Template/i })).toBeDisabled();
  });

  it('Draft (is_active=false) + total 80 → Save enabled, no blocker panel', () => {
    const t = makeTemplate({ is_active: false });
    t.sections.criteria![0].weight = 50; // total 80
    wrap(<TemplateEditorDialog open onOpenChange={() => {}} template={t} onSaved={() => {}} />);
    expect(screen.queryByText(/Cannot save as Active/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save Template/i })).not.toBeDisabled();
  });

  it('Row weight 150 → row shows error, Save disabled even in Draft', () => {
    const t = makeTemplate({ is_active: false });
    t.sections.criteria![0].weight = 150;
    wrap(<TemplateEditorDialog open onOpenChange={() => {}} template={t} onSaved={() => {}} />);
    expect(screen.getByText(/0 – 100 only/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save Template/i })).toBeDisabled();
  });
});