import { describe, it, expect } from 'vitest';
import {
  isKraBasedTemplate,
  resolveKraSlot,
  kraPointsToRating0to5,
  resolveKraRatingBand,
  projectKraFinalFromSystemScores,
} from './kraDerivedRating';

const mkTpl = (system_scores: any[] = [], criteria: any[] = []) =>
  ({ sections: { system_scores, criteria } } as any);

describe('isKraBasedTemplate', () => {
  it('true when any slot is carry_kra', () => {
    expect(isKraBasedTemplate(mkTpl([{ id: 'k', source: 'carry_kra', weight: 100 }]))).toBe(true);
  });
  it('false for pure-criteria template', () => {
    expect(isKraBasedTemplate(mkTpl([{ id: 's', source: 'safety', weight: 10 }]))).toBe(false);
  });
  it('false when template missing', () => {
    expect(isKraBasedTemplate(null)).toBe(false);
    expect(isKraBasedTemplate(undefined)).toBe(false);
  });
});

describe('resolveKraSlot', () => {
  it('sums KRA weights across multiple slots', () => {
    const info = resolveKraSlot(mkTpl([
      { id: 'k1', source: 'carry_kra', weight: 60 },
      { id: 'k2', source: 'carry_kra', weight: 40 },
      { id: 's', source: 'safety', weight: 10 },
    ]));
    expect(info?.kraMaxPoints).toBe(100);
  });
  it('returns null for non-KRA templates', () => {
    expect(resolveKraSlot(mkTpl([{ id: 's', source: 'safety', weight: 10 }]))).toBeNull();
  });
});

describe('kraPointsToRating0to5', () => {
  it('scales points to /5', () => {
    expect(kraPointsToRating0to5(80, 100)).toBe(4);
    expect(kraPointsToRating0to5(45, 50)).toBe(4.5);
  });
  it('clamps overflow and negatives', () => {
    expect(kraPointsToRating0to5(120, 100)).toBe(5);
    expect(kraPointsToRating0to5(-5, 100)).toBe(0);
  });
  it('null when max is 0 or points missing', () => {
    expect(kraPointsToRating0to5(0, 0)).toBeNull();
    expect(kraPointsToRating0to5(null, 100)).toBeNull();
    expect(kraPointsToRating0to5(undefined, 100)).toBeNull();
  });
});

describe('resolveKraRatingBand', () => {
  it.each([
    [85, 'Outstanding'], [100, 'Outstanding'],
    [84.99, 'Good'], [70, 'Good'],
    [69.9, 'Average'], [55, 'Average'],
    [54.9, 'Poor'], [0, 'Poor'],
  ])('%f → %s', (score, expected) => {
    expect(resolveKraRatingBand(score as number)).toBe(expected);
  });
});

describe('projectKraFinalFromSystemScores', () => {
  it('100% KRA — projects total from carry_kra slot only', () => {
    const tpl = mkTpl([{ id: 'k', source: 'carry_kra', weight: 100 }]);
    const out = projectKraFinalFromSystemScores(tpl, { k: 92 });
    expect(out?.total_0_100).toBe(92);
    expect(out?.rating).toBe('Outstanding');
  });
  it('blends KRA + safety points', () => {
    const tpl = mkTpl([
      { id: 'k', source: 'carry_kra', weight: 80 },
      { id: 's', source: 'safety', weight: 20 },
    ]);
    const out = projectKraFinalFromSystemScores(tpl, { k: 60, s: 15 });
    expect(out?.total_0_100).toBe(75);
    expect(out?.rating).toBe('Good');
  });
  it('returns null when KRA slot has no value', () => {
    const tpl = mkTpl([{ id: 'k', source: 'carry_kra', weight: 100 }]);
    expect(projectKraFinalFromSystemScores(tpl, {})).toBeNull();
  });
  it('returns null for non-KRA templates', () => {
    const tpl = mkTpl([{ id: 's', source: 'safety', weight: 100 }]);
    expect(projectKraFinalFromSystemScores(tpl, { s: 90 })).toBeNull();
  });
  it('clamps overflow to 100', () => {
    const tpl = mkTpl([
      { id: 'k', source: 'carry_kra', weight: 100 },
      { id: 's', source: 'safety', weight: 0 },
    ]);
    const out = projectKraFinalFromSystemScores(tpl, { k: 130, s: 5 });
    expect(out?.total_0_100).toBe(100);
  });
});