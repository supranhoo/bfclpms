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
  it('handleLoad hard-evicts the monthly-trend query before refetching', () => {
    const src = read('src/components/reports/MonthlyTrendView.tsx');
    expect(src).toMatch(/useQueryClient/);
    // removeQueries is synchronous — invalidateQueries alone races with the
    // subsequent setRequestedRange and can hand back the previous empty
    // payload from cache.
    expect(src).toMatch(/removeQueries\(\s*\{\s*queryKey:\s*\['monthly-trend'\]\s*\}\s*\)/);
  });

  it('useMonthlyTrend keeps staleTime <= 60s and surfaces silent batch failures', () => {
    const src = read('src/hooks/useMonthlyTrend.ts');
    // staleTime must NOT regress to the old 5-minute window.
    expect(src).not.toMatch(/staleTime:\s*5\s*\*\s*60\s*\*\s*1000/);
    expect(src).toMatch(/staleTime:\s*30\s*\*\s*1000/);
    // Diagnostic warning must remain in place.
    expect(src).toMatch(/possible batch\/URL failure/);
  });

  it('useMonthlyTrend caps submission batches at 150 IDs', () => {
    const src = read('src/hooks/useMonthlyTrend.ts');
    expect(src).toMatch(/SUB_BATCH\s*=\s*150/);
    // The previous 800 ceiling produced ~30KB URLs and 414s.
    expect(src).not.toMatch(/SUB_BATCH\s*=\s*800/);
  });

  it('useMonthlyTrend retries submission batch errors before throwing', () => {
    const src = read('src/hooks/useMonthlyTrend.ts');
    // Retry + shrink-on-error helper before final throw.
    expect(src).toMatch(/submissions batch failed after retries/);
    expect(src).toMatch(/throw r\.error/);
    expect(src).toMatch(/b\.slice\(0,\s*mid\)/);
  });

  it('useMonthlyTrend throws when KPIs load but ALL submission batches failed', () => {
    const src = read('src/hooks/useMonthlyTrend.ts');
    expect(src).toMatch(/but 0 submissions/);
    expect(src).toMatch(/Refusing to render an empty report/);
    // Guard must be conditional on zero successes, not just empty map.
    expect(src).toMatch(/subBatchSuccesses\s*===\s*0/);
  });

  it('useMonthlyTrend throws when KPIs load but 0 employees aggregated', () => {
    const src = read('src/hooks/useMonthlyTrend.ts');
    expect(src).toMatch(/0 employees aggregated/);
  });

  it('useMonthlyTrend exposes reporting manager formatted as Name(Code)', () => {
    const hook = read('src/hooks/useMonthlyTrend.ts');
    expect(hook).toMatch(/reportingManagerName:\s*string\s*\|\s*null/);
    expect(hook).toMatch(/reporting_manager_id/);
    // Format: code ? `${name}(${code})` : name
    expect(hook).toMatch(/\$\{name\}\(\$\{code\}\)/);
  });

  it('Monthly Trend export includes Reporting Manager column', () => {
    const view = read('src/components/reports/MonthlyTrendView.tsx');
    expect(view).toMatch(/'Reporting Manager':\s*emp\.reportingManagerName/);
  });
});