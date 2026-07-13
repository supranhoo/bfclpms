import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Contract guard for the Monthly Scorecard → Date Range (Trend) report.
 *
 * The report now aggregates on the server via `get_monthly_trend` RPC to
 * avoid the earlier fragility (13k+ KPIs → 88+ REST batches → sporadic
 * URL-length / timeout failures that showed a red banner even when every
 * employee had scores in every month).
 *
 * These assertions lock down the new contract.
 */
function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('Monthly Scorecard trend — server-side aggregation contract', () => {
  it('handleLoad hard-evicts the monthly-trend query before refetching', () => {
    const src = read('src/components/reports/MonthlyTrendView.tsx');
    expect(src).toMatch(/useQueryClient/);
    expect(src).toMatch(/removeQueries\(\s*\{\s*queryKey:\s*\['monthly-trend'\]\s*\}\s*\)/);
  });

  it('useMonthlyTrend calls the server RPC (no client-side batching)', () => {
    const src = read('src/hooks/useMonthlyTrend.ts');
    expect(src).toMatch(/supabase\.rpc\(\s*['"]get_monthly_trend['"]/);
    // Old client-batch machinery must NOT reappear — it caused the timeouts.
    expect(src).not.toMatch(/SUB_BATCH\s*=\s*150/);
    expect(src).not.toMatch(/subBatchSuccesses/);
    expect(src).not.toMatch(/submissions batch failed after retries/);
  });

  it('useMonthlyTrend keeps staleTime short (<= 60s)', () => {
    const src = read('src/hooks/useMonthlyTrend.ts');
    expect(src).not.toMatch(/staleTime:\s*5\s*\*\s*60\s*\*\s*1000/);
    expect(src).toMatch(/staleTime:\s*30\s*\*\s*1000/);
  });

  it('useMonthlyTrend surfaces the underlying RPC error message', () => {
    const src = read('src/hooks/useMonthlyTrend.ts');
    expect(src).toMatch(/error\.message\s*\|\|\s*['"]Failed to fetch monthly trend['"]/);
  });

  it('MonthlyTrendView error banner surfaces the real message, not a generic string', () => {
    const view = read('src/components/reports/MonthlyTrendView.tsx');
    expect(view).toMatch(/Failed to load trend data:/);
    expect(view).toMatch(/\(error as any\)\?\.message/);
    // The old generic wording must be gone — it hid actionable errors.
    expect(view).not.toMatch(/The range may be too wide or the server timed out/);
  });

  it('Monthly Trend export includes Reporting Manager column', () => {
    const view = read('src/components/reports/MonthlyTrendView.tsx');
    expect(view).toMatch(/'Reporting Manager':\s*emp\.reportingManagerName/);
  });
});