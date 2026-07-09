import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { formatAchievement } from './SystemScoresPanel';
import { SystemScoresPanel } from './SystemScoresPanel';

describe('formatAchievement', () => {
  it('formats percent integers as N%', () => {
    expect(formatAchievement(90, 'percent')).toBe('90%');
  });
  it('coerces fractional percent (0.9) to 90%', () => {
    expect(formatAchievement(0.9, 'percent')).toBe('90%');
  });
  it('renders binary as Yes/No', () => {
    expect(formatAchievement(1, 'binary')).toBe('Yes');
    expect(formatAchievement(0, 'binary')).toBe('No');
  });
  it('appends days unit', () => {
    expect(formatAchievement(48, 'days')).toBe('48 days');
    expect(formatAchievement(1, 'days')).toBe('1 day');
  });
  it('falls back to raw number for count/rating/unknown', () => {
    expect(formatAchievement(12, 'count')).toBe('12');
    expect(formatAchievement(3, 'rating')).toBe('3');
    expect(formatAchievement(7, undefined)).toBe('7');
  });
  it('returns em dash for null/empty', () => {
    expect(formatAchievement(null, 'percent')).toBe('—');
    expect(formatAchievement(undefined, 'binary')).toBe('—');
    expect(formatAchievement('', 'days')).toBe('—');
  });
});

describe('SystemScoresPanel achievement display', () => {
  it('renders raw percent achievement with derived rating before contributed points', () => {
    render(
      <SystemScoresPanel
        systemScores={[
          {
            id: 'annual_production',
            name: 'Annual Production Target Vs Actual',
            weight: 25,
            source: 'system',
            uom_type: 'percent',
            scoring_rules: {
              direction: 'higher_better',
              bands: [
                { score: 5, threshold: 100 },
                { score: 4, threshold: 95 },
                { score: 3, threshold: 90 },
                { score: 2, threshold: 85 },
                { score: 1, threshold: 80 },
                { score: 0, threshold: 0 },
              ],
            },
          } as any,
        ]}
        values={{ annual_production: 15 }}
        rawValues={{ annual_production: 90 }}
        readOnly
      />,
    );

    expect(screen.getByText('Achievement:')).toBeInTheDocument();
    expect(screen.getByText('90%')).toBeInTheDocument();
    expect(screen.getByText('Rating 3/5')).toBeInTheDocument();
    expect(screen.getByText('Contributes 15.00 / 25 points to your appraisal')).toBeInTheDocument();
  });
});