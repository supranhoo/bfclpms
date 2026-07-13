import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CriterionOptionsDialog } from './CriterionOptionsDialog';
import type { TemplateCriterion } from '@/types/annualReview';

describe('CriterionOptionsDialog', () => {
  it('warns admins when authored options reuse the same score', () => {
    const criterion: TemplateCriterion = {
      id: 'crit_rhsnun4',
      name: 'FAD - E&I KPI & Target Achievement',
      weight: 10,
      reviewer_stages: ['self'],
      options: [
        { id: 'o_22dd15m', label: 'Exceptional achievement', score: 0 },
        { id: 'o_zlihsju', label: 'Met or exceeded major targets', score: 0 },
      ],
    };

    render(
      <CriterionOptionsDialog
        open
        onOpenChange={vi.fn()}
        criterion={criterion}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByText(/Duplicate option scores: 0/i)).toBeInTheDocument();
    expect(screen.getByText(/highlight only one selected option/i)).toBeInTheDocument();
  });
});