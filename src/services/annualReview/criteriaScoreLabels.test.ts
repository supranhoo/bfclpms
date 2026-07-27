import { describe, it, expect } from 'vitest';
import { formatScoreMap, type LabelMap } from './criteriaScoreLabels';

const map: LabelMap = {
  order: ['crit_a', 'crit_b', 'safety'],
  labels: { crit_a: 'Quality of Work', crit_b: 'Attendance', safety: 'Safety Compliance' },
};

describe('formatScoreMap (ADR-180)', () => {
  it('renders labels in the template-authored order', () => {
    expect(formatScoreMap({ safety: 4, crit_b: 5, crit_a: 3 }, map))
      .toBe('Quality of Work: 3 | Attendance: 5 | Safety Compliance: 4');
  });

  it('appends unknown keys with their raw id instead of dropping them', () => {
    expect(formatScoreMap({ crit_a: 3, crit_zz9: 2 }, map))
      .toBe('Quality of Work: 3 | crit_zz9: 2');
  });

  it('falls back to raw ids when no label map is available', () => {
    expect(formatScoreMap({ crit_a: 4 }, undefined)).toBe('crit_a: 4');
  });

  it('returns an empty string for null/empty maps', () => {
    expect(formatScoreMap(null, map)).toBe('');
    expect(formatScoreMap(undefined, map)).toBe('');
    expect(formatScoreMap({}, map)).toBe('');
  });

  it('trims decimals to at most 2 places', () => {
    expect(formatScoreMap({ crit_a: 4.5678 }, map)).toBe('Quality of Work: 4.57');
  });
});
