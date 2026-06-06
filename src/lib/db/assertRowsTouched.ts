/**
 * Universal silent-RLS-failure guard.
 *
 * Supabase `.update()` / `.insert()` / `.delete()` return no error when RLS
 * filters the target rows — the call simply touches 0 rows. Without an
 * explicit row-count check the caller's `onSuccess` fires and the user sees
 * a misleading "Saved" toast even though nothing changed.
 *
 * Pattern: append `.select('id')` to every mutation on an RLS-protected
 * table, then pipe the `{ data, error }` result through this helper. If
 * `error` is set it's re-thrown verbatim; if `data` is empty/null the helper
 * throws a uniform PermissionError with toast-ready copy.
 *
 * RCA: see ADR-079 (Access-Profile / RLS alignment).
 */

export class PermissionError extends Error {
  readonly code = 'PERMISSION_DENIED';
  readonly menuKey?: string;
  readonly action?: string;
  constructor(message: string, menuKey?: string, action?: string) {
    super(message);
    this.name = 'PermissionError';
    this.menuKey = menuKey;
    this.action = action;
  }
}

const ACTION_VERB: Record<string, string> = {
  add: 'create',
  insert: 'create',
  update: 'update',
  delete: 'delete',
  view: 'view',
};

export interface AssertRowsTouchedOptions {
  /** Menu key the caller belongs to (e.g. `admin-users`). Surfaced in the toast. */
  menuKey?: string;
  /** Action being attempted. */
  action?: 'add' | 'update' | 'delete' | 'view' | 'insert';
  /** Human label for the resource being changed (e.g. "this user"). */
  resource?: string;
}

export function assertRowsTouched<T>(
  rows: T[] | null | undefined,
  error: { message: string } | null | undefined,
  opts: AssertRowsTouchedOptions = {},
): asserts rows is T[] {
  if (error) throw new Error(error.message);
  if (!rows || rows.length === 0) {
    const verb = ACTION_VERB[opts.action ?? 'update'] ?? 'modify';
    const target = opts.resource ?? 'this record';
    throw new PermissionError(
      `You do not have permission to ${verb} ${target}. ` +
        `Ask an Admin to grant the required right on your Access Profile.`,
      opts.menuKey,
      opts.action,
    );
  }
}