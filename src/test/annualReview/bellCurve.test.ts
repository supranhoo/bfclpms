import { describe, it, expect } from 'vitest';
import {
  DEFAULT_BELL_CURVE_CONFIG,
  bandForRating,
  complianceFor,
  computeDistribution,
  computeSummary,
  groupDistribution,
  heatmapMatrix,
  matchesScoringSource,
  normalizationHints,
  scoringSourceOf,
  targetCurvePoints,
  targetsSum,
  validateConfig,
  type BellCurveInput,
} from '@/lib/annualReview/bellCurve';

const cfg = { ...DEFAULT_BELL_CURVE_CONFIG };

function row(i: number, score: number | null, extra: Partial<BellCurveInput> = {}): BellCurveInput {
  return {
    instance_id: `i${i}`,
    employee_code: `E${i}`,
    employee_name: `Emp ${i}`,
    total_score: score,
    department_id: 'd1',
    department_name: 'Ops',
    ...extra,
  };
}

describe('bellCurve — banding', () => {
  it('rounds ratings to the nearest band and clamps to 1..5', () => {
    expect(bandForRating(4.25)).toBe(4);
    expect(bandForRating(4.5)).toBe(5);
    expect(bandForRating(0.2)).toBe(1);
    expect(bandForRating(9)).toBe(5);
  });
  it('returns null for missing ratings', () => {
    expect(bandForRating(null)).toBeNull();
    expect(bandForRating(undefined)).toBeNull();
  });
});

describe('bellCurve — distribution', () => {
  it('excludes unrated and excluded employees from the denominator', () => {
    const rows = [row(1, 100), row(2, null), row(3, 60, { is_excluded: true })];
    const s = computeSummary(rows, cfg);
    expect(s.totalEmployees).toBe(2);
    expect(s.ratedEmployees).toBe(1);
    expect(s.unratedEmployees).toBe(1);
  });

  it('computes actual percentages and variance against target', () => {
    // 10 employees: 1 at rating 5, 9 at rating 3.
    const rows = [row(0, 100), ...Array.from({ length: 9 }, (_, i) => row(i + 1, 60))];
    const bands = computeDistribution(rows, cfg);
    const b5 = bands.find((b) => b.band === 5)!;
    const b3 = bands.find((b) => b.band === 3)!;
    expect(b5.count).toBe(1);
    expect(b5.actualPct).toBe(10);
    expect(b5.variancePct).toBe(0);
    expect(b5.compliance).toBe('green');
    expect(b3.count).toBe(9);
    expect(b3.variancePct).toBe(50);
    expect(b3.compliance).toBe('red');
  });

  it('handles an empty dataset without dividing by zero', () => {
    const bands = computeDistribution([], cfg);
    expect(bands.every((b) => b.count === 0 && b.actualPct === 0)).toBe(true);
    expect(computeSummary([], cfg).averageRating).toBeNull();
  });

  it('averages ratings out of 5', () => {
    const s = computeSummary([row(1, 100), row(2, 60)], cfg);
    expect(s.averageRating).toBe(4);
  });
});

describe('bellCurve — compliance thresholds', () => {
  it('maps variance to green/amber/red', () => {
    expect(complianceFor(4, cfg)).toBe('green');
    expect(complianceFor(-5, cfg)).toBe('green');
    expect(complianceFor(7.5, cfg)).toBe('amber');
    expect(complianceFor(-10, cfg)).toBe('amber');
    expect(complianceFor(12, cfg)).toBe('red');
  });
});

describe('bellCurve — config validation', () => {
  it('accepts the default config', () => {
    expect(targetsSum(cfg)).toBe(100);
    expect(validateConfig(cfg)).toBeNull();
  });
  it('rejects targets that do not total 100', () => {
    expect(validateConfig({ ...cfg, target_3: 30 })).toMatch(/total 100/);
  });
  it('rejects an amber threshold below green', () => {
    expect(validateConfig({ ...cfg, amber_threshold: 3 })).toMatch(/Amber/);
  });
});

describe('bellCurve — grouping and hints', () => {
  const rows = [
    row(1, 100, { department_id: 'd1', department_name: 'Ops' }),
    row(2, 60, { department_id: 'd1', department_name: 'Ops' }),
    row(3, 40, { department_id: 'd2', department_name: 'Sales' }),
    row(4, null, { department_id: 'd2', department_name: 'Sales' }),
  ];

  it('groups by department and sorts by rated count', () => {
    const groups = groupDistribution(rows, 'department', cfg);
    expect(groups.map((g) => g.id)).toEqual(['d1', 'd2']);
    expect(groups[0].summary.ratedEmployees).toBe(2);
  });

  it('builds a heatmap row per group with 5 cells', () => {
    const heat = heatmapMatrix(rows, 'department', cfg);
    expect(heat).toHaveLength(2);
    expect(heat[0].cells).toHaveLength(5);
  });

  it('suggests moving people out of over-populated bands', () => {
    const bands = computeDistribution([row(0, 100), ...Array.from({ length: 9 }, (_, i) => row(i + 1, 60))], cfg);
    const hints = normalizationHints(bands, cfg);
    const over = hints.find((h) => h.band === 3);
    expect(over?.direction).toBe('over');
    expect(over?.message).toContain('Needs Improvement');
  });
});

describe('bellCurve — target curve', () => {
  it('samples a positive curve across the 1..5 axis', () => {
    const pts = targetCurvePoints(cfg, 100);
    expect(pts[0].x).toBe(1);
    expect(pts[pts.length - 1].x).toBe(5);
    expect(pts.every((p) => p.y >= 0)).toBe(true);
    const peak = pts.reduce((a, p) => (p.y > a.y ? p : a));
    expect(peak.x).toBeGreaterThan(2.5);
    expect(peak.x).toBeLessThan(3.5);
  });
});