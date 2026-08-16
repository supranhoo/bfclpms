/**
 * ADR-284 / ADR-285 — Performance Console access tiers.
 *
 * Read: admin / management / auditor / hr_pms (server SSOT `bu_console_can_read`).
 * Write: admin / management / auditor (server SSOT `bu_console_can_write`) —
 * hr_pms stays strictly read-only.
 *
 * Stage rule (ADR-285): a KPI that is still in `kra_set` is Admin-only design
 * space. Management and Audit may act on it only once it has moved past KRA Set
 * (server SSOT `bu_console_kpi_actionable`). Server-side, blocked rows come back
 * as skipped with reason `kra_set_admin_only` — never as a failed run.
 *
 * This hook mirrors that server contract in the UI so each tier gets an honest
 * surface instead of buttons that fail on submit.
 * POLICY §CONSOLE-ACCESS-TIERS.
 */
import { useAuth } from '@/contexts/AuthContext';
import { useMenuAccess } from '@/hooks/useMenuAccess';

export const BU_CONSOLE_MENU_KEY = 'admin-bu-console';

/** The console never writes to a KPI still in KRA design, except as admin. */
export const KRA_SET_STATUS = 'kra_set';

export interface BuConsoleCapability {
  /** Group edits, tuning, approvals, KRA tree writes, merge decisions. */
  canWrite: boolean;
  /** Admin is the only tier allowed to act while a KPI is still in KRA Set. */
  isAdmin: boolean;
  /**
   * Stage-aware gate. `status` is the KPI's workflow status; pass `undefined`
   * for surfaces that are not tied to a single KPI (KRA tree, merge queue).
   */
  canActOnStatus: (status?: string | null) => boolean;
  /** Convenience inverse — drives the read-only banner. */
  isReadOnly: boolean;
  isLoading: boolean;
}

export function useBuConsoleCapability(): BuConsoleCapability {
  const { effectiveRole, loading } = useAuth();
  const { canPerform, isLoading } = useMenuAccess();

  const isAdmin = effectiveRole === 'admin';

  // Mirrors `bu_console_can_write`. An explicit profile-level 'update' right on
  // the console menu key is honoured as well, so access can be widened from
  // Menu Access without a code change.
  const canWrite =
    isAdmin ||
    effectiveRole === 'management' ||
    effectiveRole === 'auditor' ||
    canPerform(BU_CONSOLE_MENU_KEY, 'update');

  // Mirrors `bu_console_kpi_actionable`.
  const canActOnStatus = (status?: string | null) => {
    if (!canWrite) return false;
    if (isAdmin) return true;
    return status !== KRA_SET_STATUS;
  };

  return {
    canWrite,
    isAdmin,
    canActOnStatus,
    isReadOnly: !canWrite,
    isLoading: loading || isLoading,
  };
}
