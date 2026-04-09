

## Brainstorm: Quarterly & Bi-Monthly KPI Gaps — Full Lifecycle Analysis

### How Multi-Month KPIs Currently Work

```text
LIFECYCLE FLOW (intended):

1. KRA ISSUANCE / ROLLOVER
   KPIs created for ALL months in cycle (e.g., Q1: Jan, Feb, March)
   All start at status = kra_set

2. CYCLE GATE
   Reviews blocked until terminal month ends
   DB: enforce_frequency_lock_on_submission trigger
   UI: isCycleComplete() in frequencyUtils.ts

3. REVIEW (terminal month only)
   Employee submits self-review on terminal month (e.g., March for Q1)
   Manager, Skip-Level, HR PMS, Auditor, Management review in sequence
   Terminal month reaches "approved"

4. SCORE PERCOLATION
   percolate_multimonth_score trigger fires when terminal → approved
   Copies ALL score fields to sibling months (Jan, Feb)
   Siblings set to "approved" if at terminal workflow stage

5. NOTIFICATIONS
   notify_on_kpi_status_change trigger fires on each status change
   Sibling months get kpi_finalized notification when percolation approves them
```

---

### GAP 1 (CRITICAL): `get_cycle_months` DB Function Ignores `frequency_cycle_start`

**The Problem:**
The `get_cycle_months()` database function is **hardcoded** with standard calendar cycles:
- Bi-Monthly: Jan-Feb, Mar-Apr, May-Jun...
- Quarterly: Jan-Mar, Apr-Jun, Jul-Sep, Oct-Dec

But **132 out of 135 Bi-Monthly KPIs** use `frequency_cycle_start = 'Feb-Mar'`, meaning actual cycles are **Dec-Jan, Feb-Mar, Apr-May**. And 15 Quarterly KPIs use `Apr-Jun` or `Jul-Sep` cycle starts.

**Impact — Cross-Cycle Contamination:**
When January (terminal of Dec-Jan cycle) is approved:
- `get_cycle_months('Bi-Monthly', 'January')` returns `[January, February]` ← WRONG
- Percolation copies January's scores to **February** — but February belongs to the **Feb-Mar cycle**
- February gets scores from the wrong measurement period

**Confirmed in production:** Audit logs show `SCORE_PERCOLATED` entries where January → February, contaminating the Feb-Mar cycle.

**Affected consumers of `get_cycle_months()`:**
1. `percolate_multimonth_score` trigger — wrong siblings receive scores
2. `auto-rollover-kpis` edge function — `getCycleMonthsForTarget()` also hardcoded
3. `detect-retroactive-incentive-changes` edge function — hardcoded cycle logic

**The UI code (`frequencyUtils.ts`) is CORRECT** — it resolves `frequency_cycle_start` via `resolveEffectiveCycleOption()`. Only the DB/edge function layer has this gap.

### GAP 2 (MODERATE): Sibling Notifications Are Misleading

When percolation sets a sibling to `approved`, the `notify_on_kpi_status_change` trigger fires and generates a `kpi_finalized` notification. However:
- The notification says "Your KPI has been finalized" with no indication it was auto-percolated
- If the sibling was at `kra_set` (never independently reviewed), the notification implies a complete review occurred
- Verified: Bi-Monthly Feb KPIs percolated from January show `finalized_count: 0` for some, meaning the trigger didn't fire consistently (likely due to the `OLD.status = 'approved'` guard in the trigger skipping already-approved records)

### GAP 3 (MODERATE): `enforce_frequency_lock` Uses `frequency_config` Table But Not Per-KPI Override

The lock trigger reads from `frequency_config` table (global setting), which IS correctly set to `Feb-Mar` cycle for Bi-Monthly. However, the Quarterly `frequency_config` uses default `Jan-Mar` — so the 9 KPIs with `frequency_cycle_start = 'Apr-Jun'` and 6 with `Jul-Sep` are locked/unlocked on the WRONG months.

The trigger does NOT read `kpis.frequency_cycle_start` for per-KPI overrides.

### GAP 4 (LOW): Rollover Creates Records for Wrong Cycle Months

The `auto-rollover-kpis` function uses `getCycleMonthsForTarget()` which is hardcoded. For a Bi-Monthly KPI with Feb-Mar cycle start, rollover to March would create records for Mar-Apr (standard) instead of Feb-Mar (actual cycle).

---

### Proposed Fix Plan

**Fix 1: Make `get_cycle_months` Cycle-Aware (DB function)**

Update `get_cycle_months()` to accept an optional `p_cycle_start TEXT` parameter. When provided, use the cycle start to determine correct groupings instead of hardcoded calendar assumptions.

The `percolate_multimonth_score` trigger must pass `NEW.frequency_cycle_start` to `get_cycle_months()`.

**Fix 2: Make `enforce_frequency_lock` Per-KPI Aware**

Update the trigger to read `NEW.frequency_cycle_start` and resolve the correct locked months, falling back to `frequency_config` when the per-KPI field is NULL.

**Fix 3: Make Rollover Cycle-Aware**

Update `getCycleMonthsForTarget()` in `auto-rollover-kpis` to accept the source KPI's `frequency_cycle_start` and compute correct cycle months.

**Fix 4: Fix `detect-retroactive-incentive-changes`**

Same hardcoded cycle logic — needs the same cycle-start awareness.

**Fix 5: Clean Up Cross-Cycle Contaminated Data**

Migration to identify Bi-Monthly KPIs where percolation crossed cycle boundaries (e.g., Jan → Feb when Feb is in the Feb-Mar cycle) and remove the contaminated submission data so Feb can be independently reviewed as part of its own cycle.

---

### Files to Change

| File | Change |
|------|--------|
| Database migration | Update `get_cycle_months()` to accept `p_cycle_start` parameter |
| Database migration | Update `percolate_multimonth_score` to pass `frequency_cycle_start` |
| Database migration | Update `enforce_frequency_lock_on_submission` to read per-KPI cycle start |
| Database migration | Data cleanup: remove cross-cycle contaminated percolations |
| `supabase/functions/auto-rollover-kpis/index.ts` | Make `getCycleMonthsForTarget` cycle-start aware |
| `supabase/functions/detect-retroactive-incentive-changes/index.ts` | Make `getCycleMonths` cycle-start aware |
| `DOCUMENTATION.md` | Document cycle-start awareness across all layers |
| `POLICY.md` | Add policy: all cycle resolution MUST use per-KPI `frequency_cycle_start` with global fallback |

### Risk Assessment
- **Data Impact**: Contaminated Feb submissions need cleanup; Dec-Jan cycle data is intact
- **Workflow Impact**: Correct locking/unlocking for per-KPI cycle starts
- **Regression Risk**: Medium — changes to `get_cycle_months` affect percolation, locking, and rollover. Must be tested with all cycle start variants
- **Backward Compatibility**: The new `p_cycle_start` parameter defaults to NULL, preserving existing behavior for KPIs without custom cycle starts

