/**
 * Phase 2b/3a: client mirror of the DB function
 * `is_canonical_enforcement_period(period, year)`.
 *
 * The DB function remains the source of truth — this client mirror is used
 * only for read-only UI gating (e.g. hiding the registry badge for
 * pre-May-2026 data-repair flows). Behavior MUST stay identical to the SQL.
 * See `src/lib/canonicalEnforcementPeriod.test.ts` for the contract.
 */
export function isCanonicalEnforcementPeriod(
  period: string | null | undefined,
  year: number | null | undefined,
): boolean {
  if (year == null || period == null) return false;
  if (year > 2026) return true;
  if (year < 2026) return false;
  return ['may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
    .includes(period.toLowerCase());
}