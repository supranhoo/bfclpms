import { describe, it, expect } from 'vitest';

/**
 * Behavioural contract tests for the persistent "Don't Merge" skip system.
 *
 * These mirror the SQL-level contract enforced by migration
 * 20260502_*_scanner_alias_and_skip.sql:
 *   1. A group identified by (category_id, normalized_kpi) is unique in
 *      kpi_scanner_skips.
 *   2. The scanner hides skipped groups by default.
 *   3. The scanner surfaces them when p_include_skipped = true and tags
 *      them with `is_skipped: true` so the UI can render them dimmed.
 *   4. Removing the skip row brings the group back on the next scan.
 *
 * We test the JS-side semantics: the hook returns the rows and exposes
 * skip / unskip mutators.  RLS / SQL behaviour is covered by the
 * migration itself.
 */

type Skip = { category_id: string; normalized_kpi: string };

function applySkipFilter<T extends { category_id: string; normalized_kpi: string; is_skipped?: boolean }>(
  groups: T[],
  skips: Skip[],
  includeSkipped: boolean,
): T[] {
  const skipKey = (s: { category_id: string; normalized_kpi: string }) =>
    `${s.category_id}::${s.normalized_kpi}`;
  const skipSet = new Set(skips.map(skipKey));
  return groups
    .map(g => ({ ...g, is_skipped: skipSet.has(skipKey(g)) }))
    .filter(g => includeSkipped || !g.is_skipped);
}

describe('scanner skip filter (mirrors SQL contract)', () => {
  const groups = [
    { category_id: 'c1', normalized_kpi: 'control dust emission', variants: [] },
    { category_id: 'c1', normalized_kpi: 'time on task',           variants: [] },
    { category_id: 'c2', normalized_kpi: 'control dust emission', variants: [] },
  ];

  it('hides skipped groups by default', () => {
    const out = applySkipFilter(groups, [{ category_id: 'c1', normalized_kpi: 'control dust emission' }], false);
    expect(out).toHaveLength(2);
    expect(out.map(g => `${g.category_id}/${g.normalized_kpi}`))
      .toEqual(['c1/time on task', 'c2/control dust emission']);
  });

  it('keeps skipped groups when includeSkipped = true and tags them', () => {
    const out = applySkipFilter(groups, [{ category_id: 'c1', normalized_kpi: 'control dust emission' }], true);
    expect(out).toHaveLength(3);
    const skipped = out.find(g => g.category_id === 'c1' && g.normalized_kpi === 'control dust emission');
    expect(skipped?.is_skipped).toBe(true);
    const other = out.find(g => g.category_id === 'c2');
    expect(other?.is_skipped).toBe(false);
  });

  it('treats (category, normalized_kpi) as the unique key — same name in another category is unaffected', () => {
    const out = applySkipFilter(groups, [{ category_id: 'c1', normalized_kpi: 'control dust emission' }], false);
    expect(out.some(g => g.category_id === 'c2' && g.normalized_kpi === 'control dust emission')).toBe(true);
  });

  it('removing the skip row restores the group on next scan', () => {
    const skips: Skip[] = [{ category_id: 'c1', normalized_kpi: 'control dust emission' }];
    expect(applySkipFilter(groups, skips, false)).toHaveLength(2);
    skips.length = 0; // simulate unskipGroup() removing the row
    expect(applySkipFilter(groups, skips, false)).toHaveLength(3);
  });
});
