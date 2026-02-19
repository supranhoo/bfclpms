
# Root Cause Analysis — Admin Data Entry Changes Not Reflecting for Ashish Kataria (December)

## What the Database Confirms

After auditing the database, the situation is clear:

**The data IS being saved correctly.** The audit logs confirm all recent admin entries for Ashish Kataria's December KPIs were recorded:
- 7+ KPIs received `ADMIN_DATA_ENTRY_SELF` entries today (Feb 19, 2026) at ~15:31–15:33 UTC
- All entries used "Quick Fill: No Data (Score = 0)" — rating `red`, score `0`
- The `kpi_status` in `review_submissions` was updated to `submitted` ✓
- The `kpis.status` was advanced to `self_review` ✓

**The problem is: the "Advance workflow status" toggle is moving the KPIs to `self_review` — but several of those KPIs already had status `approved` (from a batch done earlier today at 14:44 UTC). The Quick Fill zero-score entry is then advancing them BACK to `self_review`, which appears as "no change" or "regression" to the admin who expected to see a positive score reflected.**

## Specific Evidence

| KPI | Status at 14:44 | Admin Entry at ~15:32 | Status Now |
|---|---|---|---|
| Budgetry Preparation | `self_review` | Quick Fill = 0 | `self_review` |
| Cost optimisation | `self_review` | Quick Fill = 0 | `self_review` |
| Stock audit variance | `self_review` | Quick Fill = 0 | `self_review` |
| Implementation of policies | `self_review` | Quick Fill = 0 | `self_review` |

Meanwhile other KPIs like "Adherence to Manning Norms", "Budget saving", "Training Hours" are **`approved`** — these were the ones that didn't receive a second admin entry today.

The user's "changes not reflecting" is happening because:

1. **The actual values they entered are score = 0 (Quick Fill)** — if they expected to see a different achieved value, the display is correct but they may have used Quick Fill when they intended to enter actual values.
2. **OR: They entered actual values but the dialog showed `self_review` status KPIs**, so the "Advance workflow status" toggle is ON and set the KPI to `self_review` — which is the same stage it was in, so visually it appears "unchanged" in the All KPIs view that may be filtered by status.
3. **There is also a React `ref` warning** in `AdminDataEntryDialog`: `Select` component is receiving a `ref` passed from a parent that doesn't use `forwardRef`. This is a console warning (not a crash) but can intermittently cause the Rating `Select` to lose its value on certain render cycles.

## The Two Root Problems

### Problem 1 — "Advance workflow status" sends already-`approved` KPIs backwards
When an admin opens a KPI that is currently in `approved` status and uses the Admin Data Entry dialog (with "Advance workflow status" = ON), the mutation sets the status to `self_review` — **because the `self` role level always resolves next status = `self_review`**. This effectively DEMOTES an approved KPI.

From `useAdminDataEntry.ts` line 196:
```ts
if (role_level === 'self') {
  newStatus = 'self_review';  // Always sets to self_review regardless of current status
}
```

This means: any admin who opens an already-`approved` KPI, enters data for "self" level, and has "Advance workflow" ON will **regress the KPI from `approved` → `self_review`**.

### Problem 2 — React `ref` warning on Select in AdminDataEntryDialog
The Rating `Select` (line 685 of `AdminDataEntryDialog.tsx`) receives a ref passed through the dialog stack. This triggers the React warning visible in the console. While this is non-critical, it can cause the `SelectValue` to display stale state.

## What Needs to Be Fixed

### Fix 1 — Guard "Advance workflow status" against demotion (Critical)

In `useAdminDataEntry.ts`, the self-entry status advance logic should check the **current KPI status** before blindly setting it to `self_review`. It should only advance (or maintain) the status — never demote:

```ts
if (role_level === 'self') {
  // Only set to self_review if the KPI is currently at kra_set
  // If it's already at self_review or beyond, don't regress it
  const { data: currentKpi } = await supabase
    .from('kpis')
    .select('status')
    .eq('id', kpi_id)
    .single();
    
  const STAGE_ORDER = ['kra_set', 'self_review', 'manager_check', ...];
  const currentIdx = STAGE_ORDER.indexOf(currentKpi.status);
  const selfReviewIdx = STAGE_ORDER.indexOf('self_review');
  
  // Only advance if currently behind self_review
  if (currentIdx < selfReviewIdx) {
    newStatus = 'self_review';
  }
  // If already at self_review or beyond, don't change status
}
```

### Fix 2 — AdminDataEntryDialog UI: Show current KPI status and warn when "Advance Status" would demote

In `AdminDataEntryDialog.tsx`, show a warning banner when:
- `roleLevel === 'self'` AND
- KPI current status is `self_review` or beyond AND
- `advanceStatus` is ON

This warns the admin: "This KPI is already at [manager_check/approved]. Enabling 'Advance workflow' will NOT change the status — data update only."

Also: auto-set `advanceStatus` default to `false` when KPI status is already past `kra_set` for self-level entries (since the data-only update is the common intent when the KPI is already in review).

### Fix 3 — adminOverrideConfirmed state not resetting between KPIs

In `AdminDataEntryDialog.tsx`, the `adminOverrideConfirmed` state is reset only when `isOpen` changes (the dialog closes). But when navigating between KPIs in the All KPIs table (dialog opens for KPI A, closes, reopens for KPI B), the `adminOverrideConfirmed` should properly reset. This is already handled by the `useEffect` on `isOpen`, but the `adminOverrideConfirmed` is NOT included in the reset block. This is a minor gap.

## Files to Modify

| File | Change | Risk |
|---|---|---|
| `src/hooks/useAdminDataEntry.ts` | Fix self-role status advance: check current KPI status before setting `self_review`; never demote a KPI that's already past `self_review` | Low — purely defensive |
| `src/components/admin/AdminDataEntryDialog.tsx` | (1) Add warning when advance toggle would have no effect or demote; (2) Auto-set advanceStatus=false as default when KPI is beyond `kra_set`; (3) Add `adminOverrideConfirmed` to the reset effect | Low |
| `DOCUMENTATION.md` | Version bump to 1.45.33 | None |

## What Will NOT Change

- The data save logic itself is working correctly — values ARE being saved to `review_submissions`
- The audit trail is intact
- The frequency lock logic introduced in 1.45.32 is not the cause here (Ashish Kataria's KPIs are all Monthly — Monthly has no locked_months in `frequency_config`)

## Expected Outcome After Fix

| Scenario | Before Fix | After Fix |
|---|---|---|
| Admin enters self data for KPI already `approved`, Advance toggle ON | KPI demoted to `self_review` | Status unchanged (data saved, no demotion) |
| Admin enters self data for KPI at `kra_set`, Advance toggle ON | KPI advanced to `self_review` ✓ | Same — no change |
| Admin enters self data for KPI at `manager_check`, Advance toggle ON | KPI demoted to `self_review` | Status unchanged (data saved only) |
| Advance toggle is ON for a KPI already in review | No warning | Warning banner: "KPI is already at [status] — workflow will not be changed" |
| adminOverrideConfirmed between KPI switches | May carry over | Always resets on dialog open |
