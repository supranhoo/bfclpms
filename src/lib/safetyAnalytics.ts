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
  refreshed_at: string;
};

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