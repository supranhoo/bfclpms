/**
 * ADR-090 — Pure helper for the oldest-row-wins anchor selection used by the
 * `repair_intra_year_cycle_anchor_drift` RPC. Extracted as a pure function so
 * the selection rule can be regression-tested without touching the database.
 */

export interface KpiAnchorRow {
  id: string;
  employee_id: string;
  kpi_name: string;
  review_year: number;
  frequency: string;
  frequency_cycle_start: string | null;
  created_at: string; // ISO timestamp
}

export interface AnchorRepairAction {
  kpi_id: string;
  from_anchor: string;
  to_anchor: string;
}

const MULTIMONTH = new Set(['Bi-Monthly', 'Quarterly', 'Half-Yearly', 'Yearly']);

function tupleKey(r: KpiAnchorRow): string {
  return `${r.employee_id}|||${r.kpi_name}|||${r.review_year}|||${r.frequency}`;
}

/**
 * Selects the repair actions needed to bring every sibling row in a
 * `(employee, kpi_name, year, frequency)` tuple onto the SAME anchor.
 * Authoritative anchor = oldest `created_at` (ties broken by id ASC) row's
 * anchor. Rows whose anchor already matches are skipped. Tuples without
 * drift are skipped.
 */
export function planAnchorRepairs(rows: KpiAnchorRow[]): AnchorRepairAction[] {
  const groups = new Map<string, KpiAnchorRow[]>();
  for (const r of rows) {
    if (!MULTIMONTH.has(r.frequency) || !r.frequency_cycle_start) continue;
    const key = tupleKey(r);
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }

  const actions: AnchorRepairAction[] = [];
  for (const arr of groups.values()) {
    const anchors = new Set(arr.map(r => r.frequency_cycle_start!));
    if (anchors.size <= 1) continue; // no drift

    const sorted = [...arr].sort((a, b) => {
      if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
      return a.id < b.id ? -1 : 1;
    });
    const authoritative = sorted[0].frequency_cycle_start!;

    for (const r of sorted) {
      if (r.frequency_cycle_start !== authoritative) {
        actions.push({
          kpi_id: r.id,
          from_anchor: r.frequency_cycle_start!,
          to_anchor: authoritative,
        });
      }
    }
  }

  return actions;
}