/**
 * ADR-344 — a scope-change skip must state its own reason.
 *
 * The cascade skips a period either because the period is closed
 * (`period_locked`) or because the KPI has no row in that month at all
 * (`no_org_kpi_rows`). Collapsing both into "locked" sent admins hunting for a
 * lock that does not exist, so the reason is always reported verbatim
 * (POLICY §ORG-KPI-SCOPE-SKIP-TRANSPARENCY).
 */

export interface SkippedPeriod {
  period: string;
  year: number;
  reason: string;
}

export interface SkipGrouping {
  locked: SkippedPeriod[];
  missing: SkippedPeriod[];
  other: SkippedPeriod[];
  total: number;
}

export function groupSkips(skipped: SkippedPeriod[] | null | undefined): SkipGrouping {
  const rows = skipped ?? [];
  return {
    locked: rows.filter((s) => s.reason === 'period_locked'),
    missing: rows.filter((s) => s.reason === 'no_org_kpi_rows'),
    other: rows.filter((s) => s.reason !== 'period_locked' && s.reason !== 'no_org_kpi_rows'),
    total: rows.length,
  };
}

const monthShort: Record<string, string> = {
  January: 'Jan', February: 'Feb', March: 'Mar', April: 'Apr', May: 'May', June: 'Jun',
  July: 'Jul', August: 'Aug', September: 'Sep', October: 'Oct', November: 'Nov', December: 'Dec',
};

export function periodList(rows: SkippedPeriod[], max = 4): string {
  const labels = rows.map((r) => `${monthShort[r.period] ?? r.period} ${r.year}`);
  if (labels.length <= max) return labels.join(', ');
  return `${labels.slice(0, max).join(', ')} +${labels.length - max} more`;
}

/** Human sentence for the skip block; empty string when nothing was skipped. */
export function skipSummaryText(skipped: SkippedPeriod[] | null | undefined): string {
  const g = groupSkips(skipped);
  if (g.total === 0) return '';
  const parts: string[] = [];
  if (g.missing.length) {
    parts.push(`${g.missing.length} have no rows for this KPI yet (${periodList(g.missing)})`);
  }
  if (g.locked.length) {
    parts.push(`${g.locked.length} locked (${periodList(g.locked)})`);
  }
  for (const o of g.other) {
    parts.push(`${o.period} ${o.year}: ${o.reason}`);
  }
  return `${g.total} period(s) skipped — ${parts.join('; ')}`;
}

/** Full toast body for a completed scope change. */
export function scopeChangeSummary(
  scopeLabel: string,
  periodsTouched: number,
  skipped: SkippedPeriod[] | null | undefined,
  seededPeriods = 0,
): string {
  const head = `Changed to "${scopeLabel}" across ${periodsTouched} period(s)`;
  const seeded = seededPeriods > 0
    ? ` · created in ${seededPeriods} new period(s)`
    : '';
  const skips = skipSummaryText(skipped);
  return skips ? `${head}${seeded}. ${skips}` : `${head}${seeded}.`;
}
