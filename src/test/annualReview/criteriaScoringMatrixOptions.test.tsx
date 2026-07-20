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
    'criterion:attendance:name': 'उपस्थिति और समय-पालन',
    'criterion:attendance:description': 'मैं समय पर काम पर आता हूँ, बिना बताए छुट्टी नहीं लेता।',
    'option:attendance:o5:label': 'हमेशा समय पर, कोई बिना बताए छुट्टी नहीं',
    'option:attendance:o3:label': 'आमतौर पर समय पर, कभी-कभार ही छुट्टी',
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

  it('hydrates duplicate-score option cards with only one selected card', () => {
    const duplicateScoreCriterion: TemplateCriterion = {
      ...baseCriterion,
      id: 'fad_ei',
      options: [
        { id: 'o5', label: 'Exceptional achievement', score: 0 },
        { id: 'o4', label: 'Met or exceeded major targets', score: 0 },
        { id: 'o3', label: 'Met basic performance benchmarks', score: 0 },
      ],
    };

    wrap(<CriteriaScoringMatrix criteria={[duplicateScoreCriterion]} values={{ fad_ei: 0 }} remarks={{}} />);

    expect(screen.getByRole('button', { name: /Exceptional achievement/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Met or exceeded major targets/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /Met basic performance benchmarks/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('moves the selected state to the clicked duplicate-score option only', () => {
    const onChangeScore = vi.fn();
    const duplicateScoreCriterion: TemplateCriterion = {
      ...baseCriterion,
      id: 'fad_ei',
      options: [
        { id: 'o5', label: 'Exceptional achievement', score: 0 },
        { id: 'o4', label: 'Met or exceeded major targets', score: 0 },
        { id: 'o3', label: 'Met basic performance benchmarks', score: 0 },
      ],
    };

    wrap(
      <CriteriaScoringMatrix
        criteria={[duplicateScoreCriterion]}
        values={{ fad_ei: 0 }}
        remarks={{}}
        onChangeScore={onChangeScore}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Met or exceeded major targets/ }));

    expect(onChangeScore).toHaveBeenCalledWith('fad_ei', 0);
    expect(screen.getByRole('button', { name: /Exceptional achievement/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /Met or exceeded major targets/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Met basic performance benchmarks/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('hydrates a saved unique score by selecting only the matching score card', () => {
    wrap(<CriteriaScoringMatrix criteria={[baseCriterion]} values={{ attendance: 3 }} remarks={{}} />);

    expect(screen.getByRole('button', { name: /Usually on time/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Always on time/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /Rarely late/ })).toHaveAttribute('aria-pressed', 'false');
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

  it('keeps the six FAD Mechanical options editable on the employee self-review surface', () => {
    const onChangeScore = vi.fn();
    const atulCriterion: TemplateCriterion = {
      ...baseCriterion,
      id: 'crit_8srxl73',
      name: 'FAD - Mechanical KPI & Target Achievement',
      options: [5, 4, 3, 2, 1, 0].map((score) => ({
        id: `score-${score}`,
        label: `Performance level ${score}`,
        score,
      })),
    };

    wrap(
      <CriteriaScoringMatrix
        criteria={[atulCriterion]}
        values={{}}
        remarks={{}}
        onChangeScore={onChangeScore}
      />,
    );

    const options = screen.getAllByRole('button', { name: /Performance level/ });
    expect(options).toHaveLength(6);
    options.forEach((option) => expect(option).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /Performance level 5/ }));
    expect(onChangeScore).toHaveBeenCalledWith('crit_8srxl73', 5);
  });

  it('keeps those same options disabled on a non-eligible team-assisted surface', () => {
    const onChangeScore = vi.fn();
    const atulCriterion: TemplateCriterion = {
      ...baseCriterion,
      id: 'crit_8srxl73',
      name: 'FAD - Mechanical KPI & Target Achievement',
      options: [5, 4, 3, 2, 1, 0].map((score) => ({
        id: `score-${score}`,
        label: `Performance level ${score}`,
        score,
      })),
    };

    wrap(
      <CriteriaScoringMatrix
        criteria={[atulCriterion]}
        values={{}}
        remarks={{}}
        readOnly
        onChangeScore={onChangeScore}
      />,
    );

    const options = screen.getAllByRole('button', { name: /Performance level/ });
    expect(options).toHaveLength(6);
    options.forEach((option) => expect(option).toBeDisabled());
    fireEvent.click(options[0]);
    expect(onChangeScore).not.toHaveBeenCalled();
  });

  it('renders independent Hindi labels for two criteria that share option ids (namespaced keys)', () => {
    const safety: TemplateCriterion = {
      ...baseCriterion,
      id: 'safety',
      name: 'Safety & Rules',
      description: 'PPE and safety rules.',
      options: baseCriterion.options!.map((o) => ({ ...o })),
    };
    const translations = {
      hi: {
        'option:attendance:o5:label': 'हमेशा समय पर',
        'option:safety:o5:label': 'हमेशा PPE पहनते हैं',
      },
    };
    wrap(
      <CriteriaScoringMatrix criteria={[baseCriterion, safety]} values={{}} remarks={{}} />,
      'hi',
      translations,
    );
    // Each criterion's o5 renders its OWN Hindi label — no cross-contamination.
    expect(screen.getByText(/Always on time, zero unexcused absences \/ हमेशा समय पर$/)).toBeInTheDocument();
    expect(screen.getByText(/Always on time, zero unexcused absences \/ हमेशा PPE पहनते हैं/)).toBeInTheDocument();
  });

  it('falls back to legacy `option:<optId>:label` when the namespaced key is absent', () => {
    const translations = {
      hi: {
        'option:o5:label': 'लीगेसी अनुवाद',
      },
    };
    wrap(
      <CriteriaScoringMatrix criteria={[baseCriterion]} values={{}} remarks={{}} />,
      'hi',
      translations,
    );
    expect(screen.getByText(/Always on time, zero unexcused absences \/ लीगेसी अनुवाद/)).toBeInTheDocument();
  });

  // ADR-119 — 100807 (Shubham Kumar) regression: draft persisted with a
  // STRING score. Previous code used `opt.score === score` which failed the
  // strict-equality check and left every tile visually unselected, so users
  // read the form as unresponsive ("mouse blocked") and could never reach
  // the submit summary dialog.
  it('hydrates when the saved score is a string (jsonb round-trip)', () => {
    wrap(
      <CriteriaScoringMatrix
        criteria={[baseCriterion]}
        // `values` is typed as number | undefined, but at runtime the draft can
        // arrive as "3" from historical rows — simulate that here.
        values={{ attendance: '3' as unknown as number }}
        remarks={{}}
      />,
    );
    expect(screen.getByRole('button', { name: /Usually on time/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('hydrates the 0–5 fallback row when the saved score is a string', () => {
    const legacy = { ...baseCriterion, options: undefined };
    wrap(
      <CriteriaScoringMatrix
        criteria={[legacy]}
        values={{ attendance: '4' as unknown as number }}
        remarks={{}}
      />,
    );
    expect(screen.getByRole('button', { name: /Score 4 —/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Score 3 —/ })).toHaveAttribute('aria-pressed', 'false');
  });
});