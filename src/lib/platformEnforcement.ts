/**
 * Hub Platform — Phase 3 enforcement pilot helpers.
 *
 * Pure functions (no I/O). Implements the 4-gate truth table that decides
 * whether a single action should be blocked in UI:
 *
 *   block = hubEnabled && pilotEnabled && isEnforceable(action) && !entitled
 *
 * The enforcement allowlist is intentionally hard-coded so it cannot grow
 * without a code review. All other CanAction wrappers stay observe-only.
 */

export const ENFORCEMENT_ALLOWLIST = ['pms.data.export'] as const;

export type EnforceableAction = typeof ENFORCEMENT_ALLOWLIST[number];

export const BLOCK_MSG = 'This action is disabled by Platform Owner settings.';

export function isEnforceable(actionKey: string): actionKey is EnforceableAction {
  return (ENFORCEMENT_ALLOWLIST as readonly string[]).includes(actionKey);
}

export interface ShouldBlockInput {
  hubEnabled: boolean;
  pilotEnabled: boolean;
  actionKey: string;
  entitled: boolean;
}

/** Returns true iff ALL four gates trip. */
export function shouldBlock(input: ShouldBlockInput): boolean {
  if (!input.hubEnabled) return false;
  if (!input.pilotEnabled) return false;
  if (!isEnforceable(input.actionKey)) return false;
  if (input.entitled) return false;
  return true;
}