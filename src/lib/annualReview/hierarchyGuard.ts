/**
 * Hierarchy sanity-guard for Annual Review dept-head / BU-head assignment.
 *
 * Background — `seedInstances*` snapshots `dept_head_id` from
 * `departments.head_user_id` and `bu_head_id` from `business_units.head_user_id`.
 * Those fields are admin-editable and can be misconfigured to point at a peer
 * of the reviewee, which then produces a review chain that contradicts the
 * employee master (see RCA for Abhishek Raj 200449 / Jitendra Kumar 200114 —
 * both report to the same manager but Jitendra was set as the EHS-Health
 * dept head, i.e. reviewing his own peer).
 *
 * This helper is a pure function with no I/O so it can be unit-tested in
 * isolation and reused from any seeder.
 */

export type MgrMap = Map<string, string | null>;

export type HeadResolution = {
  headId: string | null;
  usedFallback: boolean;
  reason?: 'self' | 'peer' | 'not_in_chain' | 'null_configured' | 'inactive' | 'authoritative';
};

/**
 * POLICY §AR-HEAD-MASTER-AUTHORITATIVE (2026-07):
 * The configured Department / Business Unit head is AUTHORITATIVE.
 * Reporting-chain membership is no longer required to justify a configured
 * head. Rationale: heads are frequently functional/administrative and do
 * not appear in an employee's direct reporting ancestor chain (RCA — FAD
 * BU head Ganapathi Varma, Admin-Pollution dept head Prabhat 101757).
 *
 * Rules, evaluated top to bottom:
 *   1. Configured id is NULL              → fallback (null_configured).
 *   2. Configured id === employee itself  → fallback (self).
 *   3. Configured id is inactive          → fallback (inactive).
 *   4. Otherwise → keep configured id. Diagnostic classification
 *      (`ancestor` / `peer` / `not_in_chain`) is preserved via `reason`
 *      when the caller passes `activeSet` / `mgrMap`, but the outcome
 *      is always the configured id.
 */
export function resolveHierarchicalHead(args: {
  employeeId: string;
  configuredHeadId: string | null | undefined;
  fallbackId: string | null;
  mgrMap: MgrMap;
  /**
   * Optional set of ACTIVE user ids. When provided, an inactive configured
   * head triggers fallback instead of being stamped. When omitted, active
   * status is not enforced by this helper (caller-side guarantee).
   */
  activeSet?: Set<string>;
}): HeadResolution {
  const { employeeId, configuredHeadId, fallbackId, mgrMap, activeSet } = args;

  if (!configuredHeadId) {
    return { headId: fallbackId ?? null, usedFallback: true, reason: 'null_configured' };
  }

  if (configuredHeadId === employeeId) {
    return { headId: fallbackId ?? null, usedFallback: true, reason: 'self' };
  }

  if (activeSet && !activeSet.has(configuredHeadId)) {
    return { headId: fallbackId ?? null, usedFallback: true, reason: 'inactive' };
  }

  // Configured id is authoritative. Compute diagnostic reason only.
  const visited = new Set<string>([employeeId]);
  let cursor: string | null = mgrMap.get(employeeId) ?? null;
  let inAncestorChain = false;
  while (cursor && !visited.has(cursor)) {
    if (cursor === configuredHeadId) { inAncestorChain = true; break; }
    visited.add(cursor);
    cursor = mgrMap.get(cursor) ?? null;
  }
  if (inAncestorChain) {
    return { headId: configuredHeadId, usedFallback: false };
  }

  const empMgr = mgrMap.get(employeeId) ?? null;
  const headMgr = mgrMap.get(configuredHeadId) ?? null;
  const isPeer = !!empMgr && !!headMgr && empMgr === headMgr;
  return {
    headId: configuredHeadId,
    usedFallback: false,
    reason: isPeer ? 'peer' : 'authoritative',
  };
}