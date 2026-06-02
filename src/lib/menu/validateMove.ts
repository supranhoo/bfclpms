import type { MenuRegistryRow, ResolvedMenuNode } from './types';

export type MoveValidation =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Mirrors the DB trigger `menu_overrides_validate` (plan §7) so the UI can
 * give instant feedback. The DB remains the authority.
 */
export function validateMove(args: {
  source: MenuRegistryRow;
  targetParentKey: string | null;
  registryByKey: Record<string, MenuRegistryRow>;
  resolvedByKey: Record<string, ResolvedMenuNode>; // for cycle detection via current effective parents
}): MoveValidation {
  const { source, targetParentKey, registryByKey, resolvedByKey } = args;

  if (!source.is_movable) {
    return { ok: false, reason: `${source.default_label} is not movable.` };
  }
  if (source.is_system_required) {
    return { ok: false, reason: `${source.default_label} is system-required.` };
  }

  if (targetParentKey === null) {
    // Top-level moves not supported in Phase 2 — every L2/L3 item has a parent.
    return { ok: false, reason: 'Top-level positions are not editable.' };
  }

  const tgt = registryByKey[targetParentKey];
  if (!tgt) return { ok: false, reason: `Unknown target parent.` };
  if (!tgt.accepts_children) {
    return { ok: false, reason: `${tgt.default_label} cannot contain children.` };
  }
  if (tgt.module_key !== source.module_key && !source.is_cross_app_movable) {
    return { ok: false, reason: `Cross-app moves are not permitted for this item.` };
  }

  // Cycle detection — walk up target's chain through effective (resolved) parents.
  let cursor: string | null = targetParentKey;
  let guard = 0;
  while (cursor && guard < 50) {
    if (cursor === source.menu_key) {
      return { ok: false, reason: 'Move would create a cycle.' };
    }
    cursor = resolvedByKey[cursor]?.parent_key ?? registryByKey[cursor]?.default_parent_key ?? null;
    guard++;
  }

  return { ok: true };
}