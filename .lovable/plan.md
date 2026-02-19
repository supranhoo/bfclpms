
# Frequency Lock Enforcement — CAPA Implementation Plan

## Confirmed Locking Behavior (No Changes to Rules)

The locking rules in `isKpiLockedForPeriod` and `frequencyCycleOptions.ts` are already correct and match the user's requirement exactly:

### Bi-Monthly (Feb-Mar cycle)
- February = LOCKED (month 2 is in `locked_months['Feb-Mar']: [2]`)
- March = OPEN (active month — entry allowed)
- April = LOCKED again (Q2 cycle: `Apr-May: [4]`)

### Quarterly (Jan-Mar cycle)
- January = LOCKED (month 1 is in `locked_months['Q1']: [1, 2]`)
- February = LOCKED (month 2 is in `locked_months['Q1']: [1, 2]`)
- March = OPEN (active month — entry allowed)
- April = LOCKED again (Q2 cycle: `Q2: [4, 5]`)

The rules are correct. The problem is that enforcement is **only visual** (overlay + disabled button) with no server-side guarantee. This is what the CAPA plan fixes.

---

## What Is Broken (Current State)

Three enforcement gaps allow entries in locked months despite correct locking rules:

### Gap 1 — Self Review Sheet: Visual-Only Lock
`FrequencyLockedOverlay` renders inside the form card as a CSS overlay (`position: absolute`). The submit button is disabled via `isFrequencyLocked`, but this relies on the async `useFrequencyConfig` hook. If config loads slowly, there is a brief window where the button is not yet disabled. More critically, there is **no server-side check** — an API-level update to `status = 'self_review'` is not blocked.

Evidence: 13 Quarterly KPIs are in `self_review` for January 2026, 1 for February 2026 — months that should have been locked.

### Gap 2 — Admin On-Behalf Entry: No Lock Check At All
`AdminDataEntryDialog.tsx` has zero frequency lock validation. Admins can submit data for any KPI in any month with no warning or block.

### Gap 3 — No Database Enforcement
The `kpis` table `UPDATE` RLS policy allows any employee to change their own KPI status. There is no database trigger preventing `kra_set → self_review` transitions during locked periods.

---

## Files to Modify

| File | Change | Risk |
|---|---|---|
| `src/components/review/SelfReviewSheet.tsx` | Replace `FrequencyLockedOverlay` approach: when `isKraSet && isFrequencyLocked`, render a dedicated locked card view instead of the input form | Low |
| `src/components/admin/AdminDataEntryDialog.tsx` | Add `isKpiLockedForPeriod` check; show lock warning banner; require admin override checkbox with justification | Low |
| New DB migration | Add trigger `prevent_locked_frequency_submission` on `kpis` table: blocks `kra_set → self_review` for employee-role users when the KPI's review_period month is in the locked months for its frequency | Medium |
| `DOCUMENTATION.md` | Version bump to 1.45.32 | None |

---

## Technical Implementation Detail

### Fix 1 — SelfReviewSheet.tsx

Currently the form card always renders for `kra_set` KPIs, with an overlay on top when locked. The fix wraps the entire form content in a conditional:

```tsx
// When kra_set + frequency locked → show locked card instead of form
if (isKpiStatus('kra_set') && isFrequencyLocked) {
  return (
    <Card>
      <CardContent className="py-12 text-center">
        <Lock className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
        <h3 className="font-semibold mb-2">Entry not allowed yet</h3>
        <p className="text-sm text-muted-foreground">
          This {selectedKpi.frequency} KPI is locked until <strong>{activeMonth}</strong>.
          Data entry opens in {activeMonth}.
        </p>
      </CardContent>
    </Card>
  );
}
```

This completely removes the form — no input fields, no submit button — making it impossible to submit through the UI.

### Fix 2 — AdminDataEntryDialog.tsx

Add frequency lock check using `isKpiLockedForPeriod` with the KPI's `frequency_cycle_start`. If locked, show a warning:

```tsx
const isLocked = isKpiLockedForPeriod(kpi.frequency, reviewMonth, reviewYear, kpi.frequency_cycle_start, frequencyConfig);

if (isLocked && !adminOverrideConfirmed) {
  // Show warning banner explaining the lock
  // Require "I confirm this is an intentional admin override" checkbox
  // Only enable Save after checkbox is checked
}
```

Admins retain override capability but must explicitly acknowledge it.

### Fix 3 — Database Trigger Migration

A PostgreSQL trigger on the `kpis` table that fires BEFORE UPDATE:

```sql
CREATE OR REPLACE FUNCTION enforce_frequency_lock_on_submission()
RETURNS TRIGGER AS $$
DECLARE
  locked_config jsonb;
  month_num int;
  is_admin boolean;
BEGIN
  -- Only block the kra_set → self_review transition
  IF OLD.status = 'kra_set' AND NEW.status = 'self_review' THEN
    -- Admins are always allowed
    SELECT has_role(auth.uid(), 'admin'::app_role) INTO is_admin;
    IF is_admin THEN RETURN NEW; END IF;
    
    -- Get the frequency lock config
    SELECT locked_months INTO locked_config
    FROM frequency_config
    WHERE frequency = NEW.frequency
    LIMIT 1;
    
    IF locked_config IS NOT NULL AND NEW.review_period IS NOT NULL THEN
      -- Get month number from review_period name
      month_num := EXTRACT(MONTH FROM TO_DATE(NEW.review_period || ' 1 2000', 'Month DD YYYY'));
      
      -- Check if this month is in any locked group
      IF EXISTS (
        SELECT 1 FROM jsonb_each(locked_config) AS e(key, val)
        WHERE val @> to_jsonb(month_num)
      ) THEN
        RAISE EXCEPTION 'Submission not allowed: % KPI is locked for %. Entry opens in the active review month.',
          NEW.frequency, NEW.review_period;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER kpi_frequency_lock_check
  BEFORE UPDATE ON kpis
  FOR EACH ROW EXECUTE FUNCTION enforce_frequency_lock_on_submission();
```

This is the deepest enforcement layer — even if someone bypasses the UI, the database will reject the status transition.

---

## Existing Data Decision

The 13 Quarterly KPIs in `self_review` for January 2026 and 1 for February 2026 were submitted through this gap. Recommendation: **leave them as-is** since Q1 ends in March 2026 — managers can review the already-submitted data normally. The trigger will prevent new violations going forward.

---

## Expected Outcome After Fix

| Scenario | Before Fix | After Fix |
|---|---|---|
| Employee opens Quarterly KPI in January | Form visible, overlay on top, submit disabled | No form at all — locked card with "Entry opens in March" |
| Employee opens Quarterly KPI in February | Same | Same locked card |
| Employee opens Quarterly KPI in March | Form visible, submit enabled | No change — unchanged |
| Admin opens on-behalf entry for locked KPI | No warning, can save | Warning banner + override confirmation required |
| API-level status update attempt during locked period | Succeeds (no DB check) | Blocked by database trigger with clear error message |
| Bi-Monthly Feb-Mar KPI in February | Form with overlay | Locked card |
| Bi-Monthly Feb-Mar KPI in March | Form open | No change |
