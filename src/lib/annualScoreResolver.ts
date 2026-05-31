/**
 * Resolves an employee's annual PMS score from monthly final scores
 * according to the configured roll-up method.
 *
 * Months are fiscal: July (7) → June (6) of next year.
 */

export type AnnualScoreMethod = 'avg_all' | 'last_6' | 'custom';

export interface MonthlyScore {
  /** Calendar month number 1-12 */
  month: number;
  /** Calendar year */
  year: number;
  /** final_score for that month, null when N/A or missing */
  score: number | null;
}

export interface ResolveOptions {
  method: AnnualScoreMethod;
  /** Calendar months 1-12 included when method = custom */
  customMonths?: number[];
}

export interface ResolveResult {
  annualScore: number | null;
  monthsConsidered: number;
  monthsExcluded: number;
}

/** Fiscal-month ordering: July=0 .. June=11 */
function fiscalOrder(m: number): number {
  return (m - 7 + 12) % 12;
}

export function resolveAnnualScore(
  monthly: MonthlyScore[],
  opts: ResolveOptions,
): ResolveResult {
  const valid = monthly.filter((m) => m.score !== null && Number.isFinite(m.score));

  let selected: MonthlyScore[] = [];
  switch (opts.method) {
    case 'avg_all':
      selected = valid;
      break;
    case 'last_6': {
      // Sort fiscal-year ascending then take last 6
      const sorted = [...valid].sort(
        (a, b) => fiscalOrder(a.month) - fiscalOrder(b.month),
      );
      selected = sorted.slice(-6);
      break;
    }
    case 'custom': {
      const months = new Set(opts.customMonths ?? []);
      selected = valid.filter((m) => months.has(m.month));
      break;
    }
  }

  if (selected.length === 0) {
    return { annualScore: null, monthsConsidered: 0, monthsExcluded: monthly.length };
  }

  const sum = selected.reduce((acc, m) => acc + (m.score as number), 0);
  return {
    annualScore: +(sum / selected.length).toFixed(4),
    monthsConsidered: selected.length,
    monthsExcluded: monthly.length - selected.length,
  };
}