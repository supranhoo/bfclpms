import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * POLICY §90b guardrail.
 *
 * Any TypeScript source that fetches `kpis` (or a joined time-series table)
 * across two calendar years via `.in('review_year', …)` MUST also either
 * (a) call `isKpiMonthInFiscalCycle` / `fiscalYearForMonth` / `isFiscalTuple`
 *     / `filterToFiscalWindow` on the returned rows, OR
 * (b) contain an explicit `(period, year)` post-filter tuple pairing
 *     (matched loosely by "review_period" and "review_year" appearing on the
 *     same line as a comparison operator).
 *
 * Registered exemptions are files where the paired-tuple check is documented
 * inline and audited by other tests.
 */

const ROOT = join(process.cwd(), 'src');
const REVIEW_YEAR_IN = /\.in\(['"]review_year['"]/;
const GUARD_TOKENS = /(isKpiMonthInFiscalCycle|fiscalYearForMonth|isFiscalTuple|filterToFiscalWindow|calendarYearForMonth)/;
// Tuple-style paired post-filter — accept any of:
//   • same-line equality between review_period and review_year
//   • template-string composite key mixing a *period* token with a *year* token
//     (e.g. `${row.period_name}|${row.review_year}`)
//   • a `.in('period_name'|'review_period', ...)` call in the same file as the
//     `.in('review_year', ...)` call, indicating both dimensions are constrained.
const TUPLE_PAIR =
  /review_period[^\n]*(===|==|!==)[^\n]*review_year|review_year[^\n]*(===|==|!==)[^\n]*review_period/;
const COMPOSITE_KEY =
  /\$\{[^}]*(period|month)[^}]*\}[|\-:_/][^`]*\$\{[^}]*year[^}]*\}|\$\{[^}]*year[^}]*\}[|\-:_/][^`]*\$\{[^}]*(period|month)[^}]*\}/i;
const PAIRED_IN = /\.in\(['"](period_name|review_period)['"]/;

const EXEMPTIONS = new Set<string>([
  // Add here ONLY with an ADR reference explaining why the file is safe.
]);

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (entry === 'node_modules' || entry === '__tests__' || entry === 'test' || entry === 'tests') continue;
      walk(p, acc);
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      acc.push(p);
    }
  }
  return acc;
}

describe('POLICY §90b — fiscal-window guardrail', () => {
  const files = walk(ROOT);

  it('every .in("review_year", …) callsite has a paired guard', () => {
    const violations: string[] = [];
    for (const file of files) {
      const rel = relative(process.cwd(), file);
      if (EXEMPTIONS.has(rel)) continue;
      const src = readFileSync(file, 'utf8');
      if (!REVIEW_YEAR_IN.test(src)) continue;
      if (
        GUARD_TOKENS.test(src) ||
        TUPLE_PAIR.test(src) ||
        COMPOSITE_KEY.test(src) ||
        PAIRED_IN.test(src)
      ) {
        continue;
      }
      violations.push(rel);
    }
    expect(
      violations,
      `The following files call .in('review_year', …) without a paired ` +
        `fiscal-window guard (see POLICY §90b / @/lib/fiscalWindow):\n  - ` +
        violations.join('\n  - '),
    ).toEqual([]);
  });
});
