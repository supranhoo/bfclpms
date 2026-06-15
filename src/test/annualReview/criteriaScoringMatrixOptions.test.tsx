import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CriteriaScoringMatrix } from '@/components/annual-review/CriteriaScoringMatrix';
import { AnnualReviewI18nProvider } from '@/components/annual-review/AnnualReviewI18nContext';
import type { TemplateCriterion } from '@/types/annualReview';

const baseCriterion: TemplateCriterion = {
  id: 'attendance',
  name: 'Attendance & Punctuality',
  description: 'I show up on time and do not take unannounced leave.',
  weight: 20,
  reviewer_stages: ['self'],
  enable_remarks: false,
  enable_evidence: false,
  options: [
    { id: 'o5', label: 'Always on time, zero unexcused absences', score: 5 },
    { id: 'o4', label: 'Rarely late, informs in advance', score: 4 },
    { id: 'o3', label: 'Usually on time, occasional valid absences', score: 3 },
    { id: 'o2', label: 'Frequently late or unplanned leaves', score: 2 },
    { id: 'o1', label: 'Very poor attendance', score: 1 },
    { id: 'o0', label: 'Unacceptable absenteeism', score: 0 },
  ],
};

const hiTranslations = {
  hi: {
    'criterion.attendance.name': 'उपस्थिति और समय-पालन',
    'criterion.attendance.description': 'मैं समय पर काम पर आता हूँ, बिना बताए छुट्टी नहीं लेता।',
    'option.o5.label': 'हमेशा समय पर, कोई बिना बताए छुट्टी नहीं',
    'option.o3.label': 'आमतौर पर समय पर, कभी-कभार ही छुट्टी',
  },
};

function wrap(ui: React.ReactElement, lang = 'en', translations: any = {}) {
  return render(
    <AnnualReviewI18nProvider currentLanguage={lang} defaultLanguage="en" templateTranslations={translations}>
      {ui}
    </AnnualReviewI18nProvider>,
  );
}

describe('CriteriaScoringMatrix — option cards', () => {
  it('falls back to the 0–5 button row when the criterion has no authored options', () => {
    const legacy = { ...baseCriterion, options: undefined };
    wrap(<CriteriaScoringMatrix criteria={[legacy]} values={{}} remarks={{}} />);
    // 0..5 round buttons
    for (const n of [0, 1, 2, 3, 4, 5]) {
      expect(screen.getByRole('button', { name: new RegExp(`Score ${n} —`) })).toBeInTheDocument();
    }
  });

  it('renders an option-card grid and emits the option score on click', () => {
    const onChangeScore = vi.fn();
    wrap(
      <CriteriaScoringMatrix
        criteria={[baseCriterion]}
        values={{ attendance: 3 }}
        remarks={{}}
        onChangeScore={onChangeScore}
      />,
    );
    const card = screen.getByRole('button', { name: /Always on time/ });
    expect(card).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(card);
    expect(onChangeScore).toHaveBeenCalledWith('attendance', 5);

    // Currently selected option (score 3) is highlighted.
    const selected = screen.getByRole('button', { name: /Usually on time/ });
    expect(selected).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows bilingual option labels + Hindi heading when language=hi and translations exist', () => {
    wrap(
      <CriteriaScoringMatrix
        criteria={[baseCriterion]}
        values={{ attendance: 3 }}
        remarks={{}}
      />,
      'hi',
      hiTranslations,
    );
    // Heading "आपका स्कोर"
    expect(screen.getByText('आपका स्कोर')).toBeInTheDocument();
    // Bilingual label "EN / HI"
    expect(
      screen.getByText(/Always on time, zero unexcused absences \/ हमेशा समय पर/),
    ).toBeInTheDocument();
    // Translated criterion name
    expect(screen.getByText('उपस्थिति और समय-पालन')).toBeInTheDocument();
    // Header badges localized
    expect(screen.getByText('भार')).toBeInTheDocument();
    expect(screen.getByText('अंक')).toBeInTheDocument();
    expect(screen.getByText('कुल')).toBeInTheDocument();
  });

  it('disables clicks when readOnly while preserving the selected card visual', () => {
    const onChangeScore = vi.fn();
    wrap(
      <CriteriaScoringMatrix
        criteria={[baseCriterion]}
        values={{ attendance: 4 }}
        remarks={{}}
        readOnly
        onChangeScore={onChangeScore}
      />,
    );
    const card = screen.getByRole('button', { name: /Always on time/ });
    expect(card).toBeDisabled();
    fireEvent.click(card);
    expect(onChangeScore).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Rarely late/ })).toHaveAttribute('aria-pressed', 'true');
  });
});