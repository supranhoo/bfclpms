import { describe, it, expect } from 'vitest';

/**
 * Pure logic test for the "Performance by Category" weightage badge.
 * The badge displays the rounded sum of weightages from scored (non-N/A) KPIs,
 * with green styling at 100% and amber styling otherwise.
 */

function badgeLabel(totalWeight: number): string {
  return `(${Math.round(totalWeight)}%)`;
}

function badgeTone(totalWeight: number): 'green' | 'amber' {
  return Math.round(totalWeight) === 100 ? 'green' : 'amber';
}

describe('Performance by Category weightage badge', () => {
  it('shows (100%) green when all KPI weights sum to 100', () => {
    expect(badgeLabel(100)).toBe('(100%)');
    expect(badgeTone(100)).toBe('green');
  });

  it('shows (98%) amber when 2% of weight is N/A', () => {
    expect(badgeLabel(98)).toBe('(98%)');
    expect(badgeTone(98)).toBe('amber');
  });

  it('rounds 99.7 to 100 and treats it as green', () => {
    expect(badgeLabel(99.7)).toBe('(100%)');
    expect(badgeTone(99.7)).toBe('green');
  });

  it('shows (0%) amber when all KPIs are N/A', () => {
    expect(badgeLabel(0)).toBe('(0%)');
    expect(badgeTone(0)).toBe('amber');
  });
});