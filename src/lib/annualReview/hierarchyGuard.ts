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
  reason?: 'self' | 'peer' | 'not_in_chain' | 'null_configured';
};

/**
 * Returns the head id that should actually be stamped onto the review
 * instance, given the configured head (from departments/business_units) and
 * the org's reporting chain.
 *
 * Rules, evaluated top to bottom:
 *   1. Configured id is NULL              → fallback (null_configured).
 *   2. Configured id === employee itself  → fallback (self).
 *   3. Configured id is anywhere in the employee's ancestor chain → keep.
 *   4. Configured id shares a manager with the employee (= peer)  → fallback (peer).
 *   5. Otherwise (unrelated branch)                               → fallback (not_in_chain).
 *
 * Fallback value is provided by the caller (usually direct manager for
 * dept-head, or 2-hops-up for bu-head) so callers can preserve their
 * existing legacy behaviour.
 */
export function resolveHierarchicalHead(args: {
  employeeId: string;
  configuredHeadId: string | null | undefined;
  fallbackId: string | null;
  mgrMap: MgrMap;
}): HeadResolution {
  const { employeeId, configuredHeadId, fallbackId, mgrMap } = args;

  if (!configuredHeadId) {
    return { headId: fallbackId ?? null, usedFallback: true, reason: 'null_configured' };
  }

  if (configuredHeadId === employeeId) {
    return { headId: fallbackId ?? null, usedFallback: true, reason: 'self' };
  }

  // Walk ancestors of the employee. Guard against cycles with a visited set.
  const visited = new Set<string>([employeeId]);
  let cursor: string | null = mgrMap.get(employeeId) ?? null;
  while (cursor && !visited.has(cursor)) {
    if (cursor === configuredHeadId) {
      return { headId: configuredHeadId, usedFallback: false };
    }
    visited.add(cursor);
    cursor = mgrMap.get(cursor) ?? null;
  }

  // Not an ancestor. Is it a peer (same direct manager)?
  const empMgr = mgrMap.get(employeeId) ?? null;
  const headMgr = mgrMap.get(configuredHeadId) ?? null;
  if (empMgr && headMgr && empMgr === headMgr) {
    return { headId: fallbackId ?? null, usedFallback: true, reason: 'peer' };
  }

  return { headId: fallbackId ?? null, usedFallback: true, reason: 'not_in_chain' };
}