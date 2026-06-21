import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SelfReviewSummaryDialog } from '@/components/annual-review/SelfReviewSummaryDialog';
import { AnnualReviewI18nProvider } from '@/components/annual-review/AnnualReviewI18nContext';
import type { AnnualReviewTemplate, TemplateDisplayMode } from '@/types/annualReview';

const template: AnnualReviewTemplate = {
  id: 't1',
  name: 'T',
  description: null,
  is_active: true,
  created_by: null,
  created_at: '',
  updated_at: '',
  sections: {
    criteria: [
      {
        id: 'c1', name: 'Attendance', weight: 20, reviewer_stages: ['self'],
        options: [{ id: 'o5', label: 'Always on time', score: 5 }],
      },
    ],
    self_review_fields: [
      { id: 'f1', label: 'Best work', placeholder: 'Write here…', required: true },
      { id: 'f2', label: 'Anything else?' },
    ],
    translations: {
      hi: {
        'criterion:c1:name': 'उपस्थिति',
        'option:o5:label':   'हमेशा समय पर',
        'field:f1:label':    'सर्वश्रेष्ठ कार्य',
      },
    },
  },
};

function renderDialog(opts: {
  mode?: TemplateDisplayMode;
  lang?: string;
  responses?: Record<string, string>;
  onConfirm?: () => void;
}) {
  const onConfirm = opts.onConfirm ?? vi.fn();
  render(
    <AnnualReviewI18nProvider
      currentLanguage={opts.lang ?? 'en'}
      defaultLanguage="en"
      templateTranslations={template.sections.translations}
      displayMode={opts.mode ?? 'bilingual'}
    >
      <SelfReviewSummaryDialog
        open
        onOpenChange={() => {}}
        onConfirm={onConfirm}
        template={template}
        draft={{
          criteria_scores: { c1: 5 },
          qualitative_responses: opts.responses ?? { f1: 'Did great things' },
          evidence: [],
        }}
        summary={{ totalCriteriaScore: 100, maxCriteriaScore: 100 }}
        composition={{
          systemActual: 0, systemMax: 0,
          criteriaActual: 100, criteriaMax: 100,
          criteriaRaw: 100, criteriaRawMax: 100,
          overallActual: 100, overallMax: 100,
          hasSystem: false, hasCriteria: true,
        }}
        evidenceByCriterion={{}}
      />
    </AnnualReviewI18nProvider>,
  );
  return { onConfirm };
}

describe('SelfReviewSummaryDialog', () => {
  it('renders translated criterion name + bilingual option label under bilingual mode', () => {
    renderDialog({ mode: 'bilingual', lang: 'hi' });
    expect(screen.getByText('उपस्थिति')).toBeInTheDocument();
    expect(screen.getByText('Always on time / हमेशा समय पर')).toBeInTheDocument();
  });

  it('shows English under english_only even when translation exists', () => {
    renderDialog({ mode: 'english_only', lang: 'hi' });
    expect(screen.getByText('Attendance')).toBeInTheDocument();
    expect(screen.queryByText('उपस्थिति')).not.toBeInTheDocument();
    expect(screen.getByText('Always on time')).toBeInTheDocument();
  });

  it('disables Confirm when a required qualitative field is empty', () => {
    const onConfirm = vi.fn();
    renderDialog({ responses: { f1: '' }, onConfirm });
    const confirm = screen.getByRole('button', { name: /confirm & submit/i });
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('calls onConfirm once when all required fields are filled', () => {
    const onConfirm = vi.fn();
    renderDialog({ responses: { f1: 'done' }, onConfirm });
    fireEvent.click(screen.getByRole('button', { name: /confirm & submit/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});