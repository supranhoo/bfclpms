/**
 * ADR-284 — Performance Console access tiers.
 *
 * The console is readable by admin / management / auditor / hr_pms (server
 * SSOT: `bu_console_can_read`), but WRITING stays admin-only — every console
 * write RPC (`bu_console_apply_kpi_changes`, `bu_console_bulk_row_overrides`,
 * `bu_goal_upsert`, merge decisions) already enforces `has_role(uid,'admin')`.
 *
 * This hook mirrors that server contract in the UI so non-admin tiers get an
 * honest read-only surface instead of buttons that fail on submit.
 * POLICY §CONSOLE-ACCESS-TIERS.
 */
import { useAuth } from '@/contexts/AuthContext';
import { useMenuAccess } from '@/hooks/useMenuAccess';

export const BU_CONSOLE_MENU_KEY = 'admin-bu-console';

export interface BuConsoleCapability {
  /** Group edits, tuning, approvals, KRA tree writes, merge decisions. */
  canWrite: boolean;
  /** Convenience inverse — drives the read-only banner. */
  isReadOnly: boolean;
  isLoading: boolean;
}

export function useBuConsoleCapability(): BuConsoleCapability {
  const { effectiveRole, loading } = useAuth();
  const { canPerform, isLoading } = useMenuAccess();

  // Admin is the only tier the server accepts writes from today. An explicit
  // profile-level 'update' right on the console menu key is honoured as well,
  // so access can be widened from Admin → Menu Access without a code change.
  const canWrite =
    effectiveRole === 'admin' || canPerform(BU_CONSOLE_MENU_KEY, 'update');

  return { canWrite, isReadOnly: !canWrite, isLoading: loading || isLoading };
}
