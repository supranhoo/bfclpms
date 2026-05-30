/**
 * safetyAnalytics SSOT — Phase 7
 * ------------------------------
 * Pure helpers for the Safety Analytics dashboard. Business logic lives
 * here per the workspace separation-of-concerns rule; React components
 * only render.
 */

export const RECORDABLE_INCIDENT_TYPES = ['accident', 'property_damage'] as const;

/**
 * TRIR (Total Recordable Incident Rate) per OSHA convention:
 *   TRIR = (recordable_cases * 200,000) / hours_worked
 * 200,000 = 100 employees × 40 hr/wk × 50 wk/yr.
 */
export function computeTRIR(recordableCases: number, hoursWorked: number): number | null {
  if (!hoursWorked || hoursWorked <= 0) return null;
  return Math.round(((recordableCases * 200000) / hoursWorked) * 100) / 100;
}

/** Compliance band for an audit score 0-100. */
export function complianceBand(score: number | null | undefined): {
  label: 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'No data';
  tone: 'success' | 'primary' | 'amber' | 'destructive' | 'muted';
} {
  if (score == null) return { label: 'No data', tone: 'muted' };
  if (score >= 90) return { label: 'Excellent', tone: 'success' };
  if (score >= 75) return { label: 'Good', tone: 'primary' };
  if (score >= 60) return { label: 'Fair', tone: 'amber' };
  return { label: 'Poor', tone: 'destructive' };
}

/** TRIR risk band for charting. */
export function trirBand(trir: number | null | undefined): {
  label: 'Low' | 'Moderate' | 'High' | 'Critical' | 'No data';
  tone: 'success' | 'primary' | 'amber' | 'destructive' | 'muted';
} {
  if (trir == null) return { label: 'No data', tone: 'muted' };
  if (trir < 1) return { label: 'Low', tone: 'success' };
  if (trir < 3) return { label: 'Moderate', tone: 'primary' };
  if (trir < 5) return { label: 'High', tone: 'amber' };
  return { label: 'Critical', tone: 'destructive' };
}

/** Convert MV row arrays to a CSV string. */
export function toCsv(rows: Array<Record<string, unknown>>, columns: string[]): string {
  const escape = (v: unknown) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.join(',');
  const body = rows.map((r) => columns.map((c) => escape(r[c])).join(',')).join('\n');
  return `${header}\n${body}`;
}

export type SafetyAnalyticsPayload = {
  trir: Array<{ business_unit_id: string | null; hours_worked: number; recordable_cases: number; trir: number | null }>;
  severity: Array<{ business_unit_id: string | null; critical_count: number; high_count: number; medium_count: number; low_count: number; total_count: number }>;
  open_vs_closed: Array<{ business_unit_id: string | null; open_count: number; closed_count: number; orphaned_count: number }>;
  training: { total_assignments: number; passed_count: number; overdue_count: number; compliance_pct: number | null } | null;
  audit_scoreboard: Array<{ business_unit_id: string | null; run_count: number; avg_score: number | null; excellent_count: number; good_count: number; poor_count: number }>;
  permit_throughput: Array<{ business_unit_id: string | null; total_permits: number; approved_count: number; active_count: number; expired_count: number; rejected_count: number }>;
  monthly_trend: Array<MonthlyTrendRow>;
  refreshed_at: string;
};

/** Phase 10 — Monthly per-BU incident trend row (12 months, dense grid). */
export type MonthlyTrendRow = {
  month_start: string; // ISO date
  period_year: number;
  period_month: number;
  business_unit_id: string | null;
  total_count: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  recordable_count: number;
  closed_count: number;
};

/** Phase 10 — Aggregate monthly trend rows across business units. */
export function aggregateMonthlyTrend(rows: MonthlyTrendRow[]): Array<{
  month_start: string;
  label: string;
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  recordable: number;
  closed: number;
}> {
  const byMonth = new Map<string, ReturnType<typeof aggregateMonthlyTrend>[number]>();
  for (const r of rows) {
    const key = r.month_start;
    const cur = byMonth.get(key) ?? {
      month_start: key,
      label: monthLabel(r.period_year, r.period_month),
      total: 0, critical: 0, high: 0, medium: 0, low: 0, recordable: 0, closed: 0,
    };
    cur.total     += Number(r.total_count)     || 0;
    cur.critical  += Number(r.critical_count)  || 0;
    cur.high      += Number(r.high_count)      || 0;
    cur.medium    += Number(r.medium_count)    || 0;
    cur.low       += Number(r.low_count)       || 0;
    cur.recordable += Number(r.recordable_count) || 0;
    cur.closed    += Number(r.closed_count)    || 0;
    byMonth.set(key, cur);
  }
  return [...byMonth.values()].sort((a, b) => a.month_start.localeCompare(b.month_start));
}

/** Phase 10 — Short month label, e.g. "Jun '26". */
export function monthLabel(year: number, month: number): string {
  const d = new Date(Date.UTC(year, Math.max(0, month - 1), 1));
  const m = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  return `${m} '${String(year).slice(-2)}`;
}

/**
 * Phase 10 — Heatmap intensity (0..1) given a value and a max in the column.
 * Returns 0 when max is 0 or value is null/undefined, so callers can render
 * a neutral cell instead of dividing by zero.
 */
export function heatmapIntensity(value: number | null | undefined, max: number): number {
  if (max <= 0 || value == null || !Number.isFinite(value) || value <= 0) return 0;
  return Math.min(1, value / max);
}

/** Aggregate org-wide totals from a multi-BU payload. */
export function aggregateTotals(p: SafetyAnalyticsPayload) {
  const sum = (arr: Array<Record<string, unknown>>, k: string) =>
    arr.reduce((a, r) => a + (Number(r[k]) || 0), 0);
  const totalRecordable = sum(p.trir as unknown as Array<Record<string, unknown>>, 'recordable_cases');
  const totalHours = sum(p.trir as unknown as Array<Record<string, unknown>>, 'hours_worked');
  return {
    orgTrir: computeTRIR(totalRecordable, totalHours),
    openIncidents: sum(p.open_vs_closed as unknown as Array<Record<string, unknown>>, 'open_count'),
    closedIncidents: sum(p.open_vs_closed as unknown as Array<Record<string, unknown>>, 'closed_count'),
    criticalSev: sum(p.severity as unknown as Array<Record<string, unknown>>, 'critical_count'),
    activePermits: sum(p.permit_throughput as unknown as Array<Record<string, unknown>>, 'active_count'),
    avgAuditScore: (() => {
      const rows = p.audit_scoreboard.filter((r) => r.avg_score != null);
      if (!rows.length) return null;
      const total = rows.reduce((a, r) => a + Number(r.avg_score) * Number(r.run_count || 1), 0);
      const runs = rows.reduce((a, r) => a + Number(r.run_count || 1), 0);
      return runs ? Math.round((total / runs) * 10) / 10 : null;
    })(),
    trainingPct: p.training?.compliance_pct ?? null,
  };
}