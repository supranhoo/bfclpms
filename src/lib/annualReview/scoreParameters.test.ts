import { describe, it, expect } from 'vitest';
import { buildScoreParameters, resolveScoringMode } from './scoreParameters';

const tpl = (criteria: any[], system: any[]) =>
  ({ sections: { criteria, system_scores: system } } as any);

describe('resolveScoringMode (ADR-174)', () => {
  it('labels a carry_kra-only template as With KRA', () => {
    expect(resolveScoringMode(tpl([], [{ id: 'k', name: 'KRA', weight: 100, source: 'carry_kra' }])))
      .toBe('With KRA');
  });
  it('labels carry_kra + criteria as Blended', () => {
    expect(resolveScoringMode(tpl(
      [{ id: 'c1', name: 'Teamwork', weight: 10 }],
      [{ id: 'k', name: 'KRA', weight: 50, source: 'carry_kra' }],
    ))).toBe('Blended');
  });
  it('labels a criteria-only template as Without KRA', () => {
    expect(resolveScoringMode(tpl([{ id: 'c1', name: 'Teamwork', weight: 10 }], [])))
      .toBe('Without KRA');
  });
  it('is safe on a null template', () => {
    expect(resolveScoringMode(null)).toBe('Without KRA');
  });
});

describe('buildScoreParameters (ADR-174)', () => {
  const template = tpl(
    [{ id: 'c1', name: 'Teamwork', weight: 6 }, { id: 'c2', name: 'Safety', weight: 4 }],
    [
      { id: 'k', name: 'KRA rollup', weight: 50, source: 'carry_kra' },
      { id: 's', name: 'Safety index', weight: 20, source: 'safety' },
    ],
  );

  it('computes contributions and totals', () => {
    const b = buildScoreParameters(template, { c1: 5, c2: 4 }, { k: 45.5, s: 18 });
    expect(b.criteriaActual).toBe(46);      // 5*6 + 4*4
    expect(b.criteriaMax).toBe(50);         // (6+4)*5
    expect(b.systemActual).toBe(63.5);
    expect(b.systemMax).toBe(70);
    expect(b.totalActual).toBe(109.5);
    expect(b.scoringMode).toBe('Blended');
    expect(b.rows).toHaveLength(4);
  });

  it('marks unscored parameters as null rather than zero', () => {
    const b = buildScoreParameters(template, {}, { k: 40 });
    const c1 = b.rows.find((r) => r.id === 'c1')!;
    expect(c1.achieved).toBeNull();
    expect(c1.contribution).toBeNull();
    expect(b.criteriaActual).toBe(0);
    expect(b.systemActual).toBe(40);
  });

  it('handles a KRA-only template with no criteria', () => {
    const kraOnly = tpl([], [{ id: 'k', name: 'KRA rollup', weight: 100, source: 'carry_kra' }]);
    const b = buildScoreParameters(kraOnly, null, { k: 91.72 });
    expect(b.scoringMode).toBe('With KRA');
    expect(b.totalActual).toBe(91.72);
    expect(b.totalMax).toBe(100);
    expect(b.rows[0].source).toBe('carry_kra');
  });

  it('returns an empty breakdown for a missing template', () => {
    const b = buildScoreParameters(null, null, null);
    expect(b.rows).toEqual([]);
    expect(b.totalActual).toBe(0);
  });
});
