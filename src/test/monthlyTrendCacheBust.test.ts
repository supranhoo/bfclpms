import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Regression guard for the Monthly Scorecard Date-Range trend.
 *
 * Bug: a failed first fetch cached `{ employees: 93 rows of all-null cells }`
 * under the React-Query key. Clicking "Reload" only re-set the same filter
 * state, producing the same query key, so React-Query returned the cached
 * payload without re-issuing the request — the table stayed blank.
 *
 * Contract:
 *   - `MonthlyTrendView.handleLoad` MUST invalidate `['monthly-trend']`.
 *   - `useMonthlyTrend` MUST keep a short `staleTime` so navigating away
 *     and back also picks up fresh data.
 *   - `useMonthlyTrend` MUST cap submission batches well under the
 *     PostgREST URL-length limit (200 IDs per `kpi_id=in.(...)` request).
 */

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('Monthly Scorecard trend cache-bust', () => {
  it('handleLoad invalidates the monthly-trend query', () => {
    const src = read('src/components/reports/MonthlyTrendView.tsx');
    expect(src).toMatch(/useQueryClient/);
    expect(src).toMatch(/invalidateQueries\(\s*\{\s*queryKey:\s*\['monthly-trend'\]\s*\}\s*\)/);
  });

  it('useMonthlyTrend keeps staleTime <= 60s and surfaces silent batch failures', () => {
    const src = read('src/hooks/useMonthlyTrend.ts');
    // staleTime must NOT regress to the old 5-minute window.
    expect(src).not.toMatch(/staleTime:\s*5\s*\*\s*60\s*\*\s*1000/);
    expect(src).toMatch(/staleTime:\s*30\s*\*\s*1000/);
    // Diagnostic warning must remain in place.
    expect(src).toMatch(/possible batch\/URL failure/);
  });

  it('useMonthlyTrend caps submission batches at 200 IDs', () => {
    const src = read('src/hooks/useMonthlyTrend.ts');
    expect(src).toMatch(/SUB_BATCH\s*=\s*200/);
    // The previous 800 ceiling produced ~30KB URLs and 414s.
    expect(src).not.toMatch(/SUB_BATCH\s*=\s*800/);
  });

  it('useMonthlyTrend throws on submission batch errors instead of swallowing them', () => {
    const src = read('src/hooks/useMonthlyTrend.ts');
    expect(src).toMatch(/throw r\.error/);
  });
});