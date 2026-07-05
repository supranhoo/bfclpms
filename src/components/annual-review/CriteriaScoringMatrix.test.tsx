import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CriteriaScoringMatrix } from './CriteriaScoringMatrix';
import { AnnualReviewI18nProvider } from './AnnualReviewI18nContext';
import type { TemplateCriterion } from '@/types/annualReview';

describe('CriteriaScoringMatrix — imported bilingual option labels', () => {
  it('renders label_hi from imported scoring bands when Hindi is selected and no template translation exists', () => {
    const criteria: TemplateCriterion[] = [{
      id: 'attendance_punctuality',
      name: 'Attendance & Punctuality',
      weight: 10,
      reviewer_stages: ['self'],
      options: [{
        id: 'o5',
        score: 5,
        label: 'Always on time; zero unexcused absence; supports reliable shift continuity.',
        label_hi: 'हमेशा समय पर; कोई अनधिकृत अनुपस्थिति नहीं; शिफ्ट निरंतरता में सहयोग करता है।',
      }],
    }];

    render(
      <AnnualReviewI18nProvider currentLanguage="hi" defaultLanguage="en" displayMode="bilingual">
        <CriteriaScoringMatrix criteria={criteria} values={{}} remarks={{}} />
      </AnnualReviewI18nProvider>,
    );

    expect(screen.getByText(/Always on time; zero unexcused absence/)).toHaveTextContent(
      /हमेशा समय पर; कोई अनधिकृत अनुपस्थिति नहीं/,
    );
  });
});