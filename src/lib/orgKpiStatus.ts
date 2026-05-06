/**
 * Shared, pure helpers that derive Org KPI status from the same facts in
 * BOTH the tile chip (OrgKpiDataEntry) and the Propagate dialog
 * (PropagationPreviewDialog). See ADR-056.
 *
 * No React, no Supabase imports — fully unit-testable and reusable.
 */

export type OrgKpiTileStatus = 'pending' | 'entered' | 'propagated' | 'stuck';

export type OkvLike = {
  status?: string | null;
  achieved_value?: number | null;
  is_na?: boolean | null;
  /** Composite key of the existingValuesMap row, used to recover empId/deptId in non-org scopes. */
  key?: string;
};

export interface DeriveTileStatusInput {
  scope: 'employee' | 'department' | 'organization';
  /** OKV rows that match the current scope (already filtered by caller). */
  okvRows: OkvLike[];
  /** All employee_ids mapped to this org KPI definition. */
  mappedEmpIds: Set<string>;
  /** Mapped employee_ids whose child kpis row is still in 'kra_set'. */
  kraSetEmpIds: Set<string>;
  /** employee_id → department_id, only needed for department scope stuck check. */
  empToDept?: Map<string, string | null>;
}

export const isOkvPropagatedOrApproved = (s?: string | null): boolean =>
  s === 'propagated' || s === 'approved';

const hasOkvValue = (v: OkvLike): boolean =>
  (v.achieved_value !== null && v.achieved_value !== undefined) || !!v.is_na;

/**
 * Predicate shared by tile + dialog: every mapped child has already advanced
 * past 'kra_set', so there is nothing left to propagate even if OKV.status
 * is still draft/sent_back. (ADR-055 fact-based override.)
 */
export function isAlreadyAdvancedPastKraSet(
  mappedEmpIds: Set<string>,
  kraSetEmpIds: Set<string>,
): boolean {
  return mappedEmpIds.size > 0 && kraSetEmpIds.size === 0;
}

/** Pull the trailing employee_id segment from a `${defKey}||dept||emp` row key. */
function empIdFromKey(k: string): string {
  const parts = k.split('||');
  return parts[parts.length - 1];
}
function deptIdFromKey(k: string): string {
  const parts = k.split('||');
  return parts[parts.length - 2];
}

export function deriveOrgKpiTileStatus(input: DeriveTileStatusInput): OrgKpiTileStatus {
  const { scope, okvRows, mappedEmpIds, kraSetEmpIds, empToDept } = input;
  const everyChildAdvanced = isAlreadyAdvancedPastKraSet(mappedEmpIds, kraSetEmpIds);

  if (scope === 'organization') {
    const val = okvRows[0];
    if (!val || !hasOkvValue(val)) return 'pending';
    if (!isOkvPropagatedOrApproved(val.status)) {
      return everyChildAdvanced ? 'propagated' : 'entered';
    }
    return kraSetEmpIds.size > 0 ? 'stuck' : 'propagated';
  }

  const matching = okvRows.filter(hasOkvValue);
  if (matching.length === 0) return 'pending';

  const allPropagated = matching.every((v) => isOkvPropagatedOrApproved(v.status));
  if (!allPropagated) {
    return everyChildAdvanced ? 'propagated' : 'entered';
  }

  if (scope === 'employee') {
    const stuckHit = matching.some((v) => v.key && kraSetEmpIds.has(empIdFromKey(v.key)));
    return stuckHit ? 'stuck' : 'propagated';
  }
  if (scope === 'department') {
    const propagatedDeptIds = new Set(
      matching.map((v) => (v.key ? deptIdFromKey(v.key) : '')).filter((d) => d && d !== 'null'),
    );
    const stuckHit = Array.from(kraSetEmpIds).some((empId) => {
      const d = empToDept?.get(empId) ?? null;
      return d ? propagatedDeptIds.has(d) : false;
    });
    return stuckHit ? 'stuck' : 'propagated';
  }
  return kraSetEmpIds.size > 0 ? 'stuck' : 'propagated';
}

// =============================================================================
// Propagation preview verdict (mirror used by the dialog headline)
// =============================================================================

export interface PreviewBreakdownRow {
  will_advance: boolean;
  reason: string;
  value_changes?: boolean;
  current_self_score?: number | null;
  [k: string]: unknown;
}

export interface PreviewVerdict {
  total: number;
  willAdvance: number;
  willSkip: number;
  lockedCount: number;
  overwriteCount: number;
  /**
   * True when the RPC returned rows but none can advance AND every skip is
   * because children have already moved past kra_set (or are reviewer-locked
   * / already in self-review). Mirrors the tile's fact-based "propagated"
   * branch — both surfaces agree there is nothing left to do.
   */
  effectivelyPropagated: boolean;
}

const ALREADY_DONE_REASONS = new Set([
  'not_in_kra_set',
  'reviewer_locked',
  'self_review_existing',
]);

export function summarisePropagationPreview(rows: PreviewBreakdownRow[]): PreviewVerdict {
  const total = rows.length;
  const willAdvance = rows.filter((r) => r.will_advance).length;
  const willSkip = total - willAdvance;
  const lockedCount = rows.filter((r) => r.reason === 'reviewer_locked').length;
  const overwriteCount = rows.filter(
    (r) =>
      r.will_advance &&
      r.value_changes &&
      r.current_self_score !== null &&
      r.current_self_score !== undefined,
  ).length;

  const effectivelyPropagated =
    total > 0 &&
    willAdvance === 0 &&
    rows.every((r) => ALREADY_DONE_REASONS.has(r.reason));

  return { total, willAdvance, willSkip, lockedCount, overwriteCount, effectivelyPropagated };
}
