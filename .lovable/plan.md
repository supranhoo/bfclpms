# Fix: Bi-Monthly Org KPIs leaking onto non-terminal months

## RCA (verified against live DB)

The KPIs in your screenshot (Bi-Monthly, `frequency_cycle_start = 'May-Jun'`, terminal = **June**) appear on the **May** Org KPI Data Entry page. When you click Propagate, the DB trigger `enforce_frequency_lock_on_submission` correctly rejects the write with *"Bi-Monthly KPI cannot be reviewed for May. Only the terminal month of the cycle is reviewable."*

Mismatch source (`src/lib/frequencyCycleOptions.ts::resolveEffectiveCycleOption`):

- `BI_MONTHLY_OPTIONS` only contains the two values `Jan-Feb` and `Feb-Mar`.
- The DB stores per-KPI `frequency_cycle_start` values like `May-Jun`, `Mar-Apr`, `Apr-May`, etc. (any 2-month window the admin picked at KPI creation time).
- When the per-KPI value isn't found in the hardcoded list, the client **silently falls back** to the global `frequency_config` row (currently `Feb-Mar,Apr-May,…`), whose `lockedMonths` say May is NOT locked → KPI shows.
- But the DB trigger reads the KPI's own `frequency_cycle_start = 'May-Jun'` literally, computes terminal = June, and blocks May.

Same defect class exists for Quarterly / Half-Yearly / Yearly cycles whose `frequency_cycle_start` doesn't match a hardcoded option (e.g. `Mar-May`, `Aug-Oct`, `May-Oct` partially).

POLICY §54: the terminal month is the single source of truth for multi-month KPIs. The UI must reflect that — non-terminal months MUST NOT list the card, so admins cannot attempt an invalid Propagate.

## Risk & Impact

- Data: zero writes; pure read-side filter change.
- Workflow: multi-month Org KPIs disappear from non-terminal months in `/admin/org-kpi-data`. They will only appear on the cycle's terminal month (already the only month where propagation succeeds).
- UI: matches the existing tooltip/badge for multi-month KPIs in MyKpis / Team Reviews (POLICY §54).
- Regression risk: low. The fallback path was returning a wrong-but-permissive option; we now compute the correct lock from the stored `frequency_cycle_start`. Verified no other consumer relies on the old fallback by searching usages of `resolveEffectiveCycleOption`.
- Scalability: pure function, no extra query.
- Rollback: revert the helper to its previous body; one file.

## Plan

1. **Add `deriveCycleOptionFromCycleStart(frequency, cycleStart)`** in `src/lib/frequencyCycleOptions.ts`. Given a `frequency_cycle_start` like `May-Jun` (Bi-Monthly) or `Mar-May` (Quarterly), generate the synthetic `CycleOption` (lockedMonths + activeMonth) for that exact starting anchor. Mirrors the DB trigger math: `cycle_pos = ((month - start_month) mod 12) mod cycle_length`; terminal month at position `cycle_length-1`.

2. **Update `resolveEffectiveCycleOption`** to call the new helper **before** falling back to global config or `options[0]`, so a per-KPI override that isn't in the hardcoded list is still respected. Keep the existing match-first behavior to avoid behavior change for `Jan-Feb` / `Feb-Mar` etc.

3. **Tests** — add `src/test/cycleStartFallbackResolution.test.ts`:
   - `May-Jun` Bi-Monthly: only **June** is unlocked; May/Jul/etc locked.
   - `Mar-Apr` Bi-Monthly: only **April** unlocked.
   - `Mar-May` Quarterly: only **May** unlocked.
   - `Aug-Oct` Quarterly: only **October** unlocked.
   - `Nov-Apr` Half-Yearly (wrapping): only **April** unlocked.
   - Returning `Jan-Feb` for a hardcoded match path still works (regression guard).

4. **Update memory & docs**
   - `mem/architecture/pms/multimonth-percolation` — note that `frequency_cycle_start` is the SSOT for cycle resolution on the client too (no silent fallback to global config when an override exists).
   - ADR-087 `docs/adr/ADR-087.md` — Client/DB cycle-resolution parity for Org KPI Data Entry.

5. **No DB changes.** No migrations. No trigger changes.

## Out of Scope

- We do not change `propagate_org_kpi_value` or relax `enforce_frequency_lock_on_submission`. The DB lock is correct and must keep blocking non-terminal writes.
- We do not change MyKpis / Team Reviews; those already use the same helper and benefit transparently.
- We do not retroactively re-show or hide KPIs in any other page beyond what `isKpiLockedForPeriod` already controls.

## Files

- `src/lib/frequencyCycleOptions.ts` — add helper + extend `resolveEffectiveCycleOption`.
- `src/test/cycleStartFallbackResolution.test.ts` — new.
- `docs/adr/ADR-087.md` — new.
- `mem/architecture/pms/multimonth-percolation` — update.

## Verification

- Run the new test suite.
- Reload `/admin/org-kpi-data` on **May 2026**: the seven Bi-Monthly KPI cards (Production incentive of FAD/SMS, Incentive sheet of DRI 100 TPD / CLU, etc., all `frequency_cycle_start='May-Jun'`) should disappear.
- Switch to **June 2026**: those same cards must appear, and Propagate must succeed.
- KPIs with `frequency_cycle_start='Feb-Mar'` (terminal = May for the Apr-May cycle) must still be visible on May.
