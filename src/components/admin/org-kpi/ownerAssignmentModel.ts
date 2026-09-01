/**
 * ADR-335 — shared model for mapping org-level KPI data entry owners.
 *
 * Ownership is period-agnostic and keyed by (category_id, kra_name, kpi_name).
 * The Performance Console group editor writes owners immediately (the KPI
 * already exists). The Admin "Assign New KRA" dialog cannot: the KPI row (and
 * its final composed name) does not exist until the create call succeeds, so
 * picks are queued as "pending" and flushed afterwards.
 *
 * POLICY §KPI-SCOPE-SINGLE-VOCABULARY.
 */

export interface OwnerKey {
  categoryId: string;
  kraName: string;
  kpiName: string;
}

export interface PendingOwner {
  id: string;
  label: string;
}

export interface OwnerAssignment extends OwnerKey {
  ownerId: string;
}

const clean = (v: string | null | undefined) => (v ?? '').replace(/\r/g, '').trim();

/** The ownership key is only usable once all three parts are filled. */
export function isOwnerKeyReady(key: Partial<OwnerKey> | null | undefined): boolean {
  return !!clean(key?.categoryId) && !!clean(key?.kraName) && !!clean(key?.kpiName);
}

/** Add a pick, ignoring duplicates and blank ids. Order is preserved. */
export function addPendingOwner(list: PendingOwner[], owner: PendingOwner): PendingOwner[] {
  const id = clean(owner?.id);
  if (!id || id === 'none') return list;
  if (list.some((o) => o.id === id)) return list;
  return [...list, { id, label: owner.label || 'Unknown' }];
}

export function removePendingOwner(list: PendingOwner[], ownerId: string): PendingOwner[] {
  return list.filter((o) => o.id !== ownerId);
}

/** Payloads for the assign mutation, one per pending pick. */
export function buildOwnerAssignments(key: OwnerKey, list: PendingOwner[]): OwnerAssignment[] {
  if (!isOwnerKeyReady(key)) return [];
  return list.map((o) => ({
    categoryId: clean(key.categoryId),
    kraName: clean(key.kraName),
    kpiName: clean(key.kpiName),
    ownerId: o.id,
  }));
}

export interface OwnerFlushOutcome {
  assigned: PendingOwner[];
  failed: PendingOwner[];
  /** Picks that must stay in the form so the user can retry. */
  remaining: PendingOwner[];
  message: string | null;
}

/**
 * Partition a flush result. Failures never roll the KPI back — they are kept
 * so the admin can retry from the same form.
 */
export function partitionOwnerFlush(
  list: PendingOwner[],
  results: { ownerId: string; ok: boolean }[],
): OwnerFlushOutcome {
  const okIds = new Set(results.filter((r) => r.ok).map((r) => r.ownerId));
  const assigned = list.filter((o) => okIds.has(o.id));
  const failed = list.filter((o) => !okIds.has(o.id));
  return {
    assigned,
    failed,
    remaining: failed,
    message: failed.length
      ? `KPI saved, but these data entry owners were not attached: ${failed.map((f) => f.label).join(', ')}`
      : null,
  };
}

/**
 * Owner rows are keyed by name, so a KRA/KPI rename must carry them over or
 * ownership is silently orphaned.
 */
export function ownerRenameCarry(
  before: OwnerKey,
  after: OwnerKey,
): { needed: boolean; from: OwnerKey; to: OwnerKey } {
  const same =
    clean(before.categoryId) === clean(after.categoryId) &&
    clean(before.kraName) === clean(after.kraName) &&
    clean(before.kpiName) === clean(after.kpiName);
  return {
    needed: !same && isOwnerKeyReady(before) && isOwnerKeyReady(after),
    from: { categoryId: clean(before.categoryId), kraName: clean(before.kraName), kpiName: clean(before.kpiName) },
    to: { categoryId: clean(after.categoryId), kraName: clean(after.kraName), kpiName: clean(after.kpiName) },
  };
}
