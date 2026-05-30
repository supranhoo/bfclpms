/**
 * Phase 11 — Safety SLA v2 SSOT helpers
 * -------------------------------------
 * Pure, read-only TypeScript mirror of the `safety_incidents_with_sla`
 * view rule. Used by the v2 monitor surface so the UI never has to issue
 * a fresh query to classify open incidents by breach risk.
 *
 * Server is still the source of truth — these helpers are presentational
 * and idempotent. No writers, no side-effects.
 */

export type SlaState = 'green' | 'amber' | 'red' | 'closed';

export interface SlaIncidentLike {
  id: string;
  status: string;
  created_at: string;
  close_due_at: string | null;
  sla_state?: SlaState | null;
}

export interface SlaClassification {
  state: SlaState;
  /** ms until due_at (negative when overdue). null when no close_due_at. */
  remaining_ms: number | null;
  /** ms since due_at when overdue (>=0), otherwise 0. */
  overdue_ms: number;
  due_at: string | null;
}

const AMBER_RATIO = 0.25; // matches DB view: amber inside the last 25% window.

/**
 * Recompute SLA state in TS using the same rule as the DB view. We trust
 * the server-computed `sla_state` first; this is a fallback / cross-check
 * for clients that received a row without it.
 */
export function classifySla(
  inc: SlaIncidentLike,
  now: Date = new Date(),
): SlaClassification {
  const due = inc.close_due_at ? new Date(inc.close_due_at) : null;
  const created = new Date(inc.created_at);
  const nowMs = now.getTime();

  if (inc.status === 'closed') {
    return { state: 'closed', remaining_ms: null, overdue_ms: 0, due_at: inc.close_due_at };
  }
  if (!due || Number.isNaN(due.getTime())) {
    // Defer to server hint if no due is materialised.
    return {
      state: (inc.sla_state ?? 'green') as SlaState,
      remaining_ms: null,
      overdue_ms: 0,
      due_at: null,
    };
  }

  const remaining = due.getTime() - nowMs;
  if (remaining < 0) {
    return { state: 'red', remaining_ms: remaining, overdue_ms: -remaining, due_at: inc.close_due_at };
  }
  const window = due.getTime() - created.getTime();
  const amberStart = due.getTime() - window * AMBER_RATIO;
  if (nowMs > amberStart) {
    return { state: 'amber', remaining_ms: remaining, overdue_ms: 0, due_at: inc.close_due_at };
  }
  return { state: 'green', remaining_ms: remaining, overdue_ms: 0, due_at: inc.close_due_at };
}

/** Short human label e.g. "2h 15m left" / "Overdue 1d 4h" / "Closed". */
export function formatSlaCountdown(c: SlaClassification): string {
  if (c.state === 'closed') return 'Closed';
  if (c.remaining_ms === null) return '—';
  const ms = c.state === 'red' ? c.overdue_ms : c.remaining_ms;
  const totalMin = Math.floor(ms / 60000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0 || d > 0) parts.push(`${h}h`);
  if (d === 0) parts.push(`${m}m`);
  const body = parts.slice(0, 2).join(' ');
  return c.state === 'red' ? `Overdue ${body}` : `${body} left`;
}

const ORDER: Record<SlaState, number> = { red: 0, amber: 1, green: 2, closed: 3 };

/**
 * Sort an array of {incident, classification} entries red→amber→green→closed,
 * tiebreaking by largest overdue then earliest due. Pure; returns a new array.
 */
export function prioritizeSlaQueue<T extends { classification: SlaClassification }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => {
    const sa = ORDER[a.classification.state];
    const sb = ORDER[b.classification.state];
    if (sa !== sb) return sa - sb;
    if (a.classification.overdue_ms !== b.classification.overdue_ms) {
      return b.classification.overdue_ms - a.classification.overdue_ms;
    }
    const da = a.classification.due_at ? Date.parse(a.classification.due_at) : Infinity;
    const db = b.classification.due_at ? Date.parse(b.classification.due_at) : Infinity;
    return da - db;
  });
}

export function badgeToneFor(state: SlaState): 'destructive' | 'secondary' | 'outline' {
  if (state === 'red') return 'destructive';
  if (state === 'amber') return 'secondary';
  return 'outline';
}