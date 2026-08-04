import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * ADR-244 — report surfaces must load calibrations cycle-scoped. Building the
 * filter from a per-row id list overflows the request URL and silently renders
 * every employee as uncalibrated.
 */
const surfaces = [
  'src/components/reports/annual-review/ComprehensiveTab.tsx',
  'src/pages/reports/AnnualReviewReport.tsx',
];

describe('ADR-244 calibration context scope', () => {
  for (const file of surfaces) {
    it(`${file} uses the cycle-scoped calibration hook`, () => {
      const src = readFileSync(file, 'utf8');
      expect(src).toContain('useAnnualReviewCycleCalibrations');
      expect(src).not.toMatch(/useAnnualReviewCalibrations\(/);
    });

    it(`${file} surfaces a calibration load failure`, () => {
      const src = readFileSync(file, 'utf8');
      expect(src).toContain('calibrationError');
    });
  }

  it('the cycle hook filters on the joined cycle_id, not an id list', () => {
    const src = readFileSync('src/hooks/useAnnualReviewCalibrations.ts', 'utf8');
    expect(src).toContain("annual_review_instances!inner(cycle_id)");
    expect(src).toContain("eq('annual_review_instances.cycle_id'");
  });
});