/**
 * Regression: long tiered option labels used to overflow the fixed 140px
 * trigger of QualitativeSelect and paint over surrounding card content on
 * Org KPI Data Entry.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QualitativeSelect } from '@/components/review/QualitativeSelect';

const LONG_LABEL = '90% – 94.99% Achievement (of the 5% Incentive Target)';

const OPTIONS = [
  { label: '≥ 15% Incentive', rating: 5 },
  { label: LONG_LABEL, rating: 1 },
];

describe('QualitativeSelect long labels', () => {
  it('renders a fluid trigger that truncates instead of a fixed 140px box', () => {
    render(
      <QualitativeSelect
        uomType="tiered"
        qualitativeOptions={OPTIONS as never}
        value={LONG_LABEL}
        onChange={() => {}}
      />
    );
    const trigger = screen.getByRole('combobox');
    expect(trigger.className).toContain('w-full');
    expect(trigger.className).toContain('min-w-0');
    expect(trigger.className).not.toContain('w-[140px]');
    expect(trigger.getAttribute('title')).toBe(LONG_LABEL);
    const label = screen.getByText(LONG_LABEL);
    expect(label.className).toContain('truncate');
  });

  it('keeps caller-provided classes', () => {
    render(
      <QualitativeSelect
        uomType="tiered"
        qualitativeOptions={OPTIONS as never}
        value={null}
        onChange={() => {}}
        className="h-9"
      />
    );
    expect(screen.getByRole('combobox').className).toContain('h-9');
  });
});
