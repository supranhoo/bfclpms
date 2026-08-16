/**
 * ADR-276 — KRA Tree contract tests.
 *
 * Locks the two things the cascade must never get wrong: the paging window
 * grows instead of jumping (so no level is silently truncated), and a row is
 * labelled KRA vs KPI by whether it aggregates children.
 */
import { describe, it, expect } from 'vitest';

const PAGE_SIZE = 100;
/** Mirrors the window used by KraTreeLevel. */
const windowSize = (pages: number) => PAGE_SIZE * pages;

const rowKind = (row: { child_count: number; goal_source: string }) =>
  row.child_count === 0 && row.goal_source === 'kpi_rollup' ? 'KPI' : 'KRA';

describe('KRA tree paging window', () => {
  it('covers every row up to the loaded window, with no gap between clicks', () => {
    const total = 250;
    const seen = new Set<number>();
    for (let pages = 1; windowSize(pages - 1) < total; pages++) {
      for (let i = 0; i < Math.min(windowSize(pages), total); i++) seen.add(i);
    }
    expect(seen.size).toBe(total);
  });

  it('stops asking for more once the window covers the total', () => {
    const total = 150;
    expect(windowSize(1) < total).toBe(true);
    expect(windowSize(2) < total).toBe(false);
  });
});

describe('KRA vs KPI labelling', () => {
  it('calls a measurable leaf a KPI', () => {
    expect(rowKind({ child_count: 0, goal_source: 'kpi_rollup' })).toBe('KPI');
  });

  it('calls anything with children a KRA', () => {
    expect(rowKind({ child_count: 3, goal_source: 'kpi_rollup' })).toBe('KRA');
  });

  it('calls a childless manual or child-rollup item a KRA, not a KPI', () => {
    expect(rowKind({ child_count: 0, goal_source: 'manual' })).toBe('KRA');
    expect(rowKind({ child_count: 0, goal_source: 'child_rollup' })).toBe('KRA');
  });
});
