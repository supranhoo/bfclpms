

# Analysis & Fix Plan: Three Issues — Rollback Routing, Admin Zero-Score Feature, and Approved Status Bug

---

## Issue 1: Where Does an HR PMS Rollback Request Go?

### Current Behavior (Confirmed via Code Audit)

When a **reviewer** (HR PMS, manager, etc.) raises a rollback request using the `RollbackRequestDialog`, the `notifyUserId` prop determines who gets the notification. Looking at actual call sites:

- **SelfReviewSheet** (Employee view): Passes `profile?.reporting_manager_id` — ✅ correct, notifies the manager.
- **UnifiedScorecard** (HR PMS, Skip-Level, Auditor view): Passes **no `notifyUserId`** — the prop is missing entirely (line 1464–1471):
  ```tsx
  <RollbackRequestDialog
    open={rollbackDialogOpen}
    ...
    workflowStages={effectiveStages}
    // notifyUserId is MISSING — nobody gets notified
  />
  ```

### Result: HR PMS Rollback Requests Go Nowhere

When Vivek (HR PMS) raises a rollback request for a KPI at `manager_check` status (which resolves a target of `self_review`), the rollback is stored in `kpi_rollback_requests` with status `pending`, but:
1. **No notification is sent** to anyone (the auditor, who is the next-level above HR PMS).
2. The banner (`RollbackRequestBanner`) only shows in the **UnifiedScorecard** when the KPI is `isReviewable()` for that view level. The auditor or management user who should action it will not see the banner unless they happen to open that specific KPI.

From the database, there are currently 2 pending rollback requests from Vivek's account that are unactioned.

### Fix: Pass the Correct `notifyUserId` in UnifiedScorecard

The "next-level reviewer" to notify depends on the view level:
- `hr_pms` → notify the **auditor user** (but auditor is a role, not a single user — the admin should be notified instead, or the notification should go to all auditor-role users)
- `skip_level` → notify the **hr_pms user** (but again, role-based)
- `manager` → notify the **skip-level user** or **hr_pms user** depending on workflow

**Pragmatic fix:** For reviewer-level rollback requests (not employee-level), the rollback is always going one stage back within the reviewer chain. The safest and most practical routing is:
- The `RollbackRequestBanner` already shows to **any user who has the `isReviewable()` right for the KPI** in UnifiedScorecard.
- The missing piece is just the **notification** — so we should look up an admin user to notify, since reviewers like HR PMS do not have a single designated "next reviewer" unlike employees who have a clear reporting manager.

**Plan**: Add `notifyUserId` to the `UnifiedScorecard`'s `RollbackRequestDialog` call by passing the `admin` role user's ID (fetched from the system) OR — simpler — display a clear confirmation message to the HR PMS user explaining the request is submitted and will be visible to the next reviewer when they open the KPI. Also add the `RollbackRequestBanner` to the **HR PMS / UnifiedScorecard** view so that when the request is actioned, feedback is visible.

**Files to modify:**
- `src/components/review/UnifiedScorecard.tsx` — pass an appropriate `notifyUserId` to `RollbackRequestDialog` (use the employee's `reporting_manager_id` as the notify target for reviewer rollback requests, since the manager-level reviewer is likely the auditor's contact)

---

## Issue 2: Admin "No Data Submitted — Set Score to Zero" Feature (Feasibility Analysis)

### Feature Request
Admin should be able to mark a KPI with score = 0 for a specific review level, explicitly indicating the employee/reviewer did not submit any data. This should:
- Set all role-level scores to 0
- Set the KPI status appropriately
- NOT break any existing workflow dependencies

### Feasibility Analysis — Complete System Check

#### Dependency Map
The feature touches these areas:

1. **`kpis.status`** — must be set to `'approved'` for the score to appear in dashboards. If the admin sets score to 0 and advances to approved, the KPI will show 0 in all reports.
2. **`review_submissions` columns** — each level has `{level}_rating`, `{level}_score`, `{level}_achieved_value`, `{level}_remarks`. Setting these to 0 is valid (zero is a legitimate score).
3. **`final_rating` and `final_score`** — the authoritative chain (`final → management → auditor → hr_pms → skip_level → manager → self`) means if we set management-level to 0 and final to 0, the dashboard will show 0.
4. **KPI Observations** — not affected by score changes, will still show.
5. **PIP (Performance Improvement Plan)** — PIPs are manually created by managers, not auto-triggered by score. No dependency.
6. **Org-level KPIs** — have their own propagation system, separate from this.
7. **Rollover** — KPI rollover copies KPI structure, not scores. Not affected.
8. **Audit logs** — already captured in `useAdminSubmitReviewData`.
9. **Notifications** — already sent on admin data entry.

#### Conclusion: Feature is Feasible with These Rules
- Zero is already a valid score in the system
- The admin data entry dialog already supports entering a value of 0
- The existing "Advance workflow status" toggle already moves the KPI forward
- The ONLY missing piece is a **dedicated UI shortcut** — a "No Data / Zero Score" quick-action in the admin dialog that pre-fills all fields with score=0, rating=red, achieved_value=0, and a standard reason

#### What Must NOT Break
- Employees with N/A (is_na = true) KPIs must continue to be excluded from scoring denominators — the feature should NOT set is_na but instead use actual zero values
- KPIs already marked N/A should NOT be overwritten by this action
- The `advance_status` toggle must remain accessible so admin can choose to advance to approved or just set the score at a specific level

### Implementation Plan for "Zero Score" Feature
Add a "Quick: Mark No Data (Score = 0)" button in `AdminDataEntryDialog` that:
1. Sets `achievedValue = '0'`, `rating = '0'` (Not Achieved), `score = '0'`
2. Pre-fills `reason = 'No data submitted — scored as zero'` (editable)
3. Keeps `is_na = false` (it IS a score, just zero)
4. Leaves `advanceStatus` at its current toggle value

This is a pure UI pre-fill — no new backend logic needed.

**File to modify:**
- `src/components/admin/AdminDataEntryDialog.tsx` — add a "Quick Fill: No Data" button in the data entry section

---

## Issue 3: Admin Submitting Data at Last Workflow Level — Not Processed as Approved

### Confirmed Bug (Database Evidence)

The database query confirmed **5 KPIs** are `status = 'approved'` but have `management_score IS NOT NULL` and `final_score IS NULL`. This means:
- Admin correctly advanced the KPI status to `approved` via `resolveForwardStatus('management', stages) → 'approved'`
- But `final_rating` and `final_score` were **never set** in `review_submissions`

### Root Cause in `useAdminDataEntry.ts`

In `useAdminSubmitReviewData`, step 6 (status advancement):
```typescript
if (role_level === 'self') {
  newStatus = 'self_review';
} else {
  const { data: stagesData } = await supabase.rpc('get_employee_workflow', { employee_uuid: employee_id });
  const stages = (stagesData as string[]) || undefined;
  newStatus = resolveForwardStatus(role_level, stages);
  // For management → resolveForwardStatus returns 'approved' ✅
}

if (newStatus) {
  await supabase.from('kpis').update({ status: newStatus }).eq('id', kpi_id);
  // ↑ This correctly sets KPI to 'approved'
  
  await supabase.from('review_submissions')
    .update({ kpi_status: 'submitted' }).eq('kpi_id', kpi_id);
  // ↑ This ONLY sets kpi_status = 'submitted' — it does NOT sync final_rating/final_score!
}
```

The `ManagementScorecard.submitManagementReview()` (the normal management review path) correctly sets:
```typescript
final_rating: management_rating,
final_score: management_score,
```

But the admin data entry path **only updates the management-level fields** and **does not copy them to final_rating/final_score**. The dashboard's scoring engine uses `final_score` as the top of the authoritative chain, so these KPIs show 0 or incorrect scores despite being approved.

### Fix: In `useAdminSubmitReviewData`, When `role_level === 'management'` and Status Advances to `'approved'`, Also Set `final_rating` and `final_score`

```typescript
// After advancing status to 'approved' for management role:
if (role_level === 'management' && newStatus === 'approved') {
  await supabase
    .from('review_submissions')
    .update({
      final_rating: rating,  // same as management rating
      final_score: score,    // same as management score
      kpi_status: 'submitted',
      updated_at: new Date().toISOString(),
    })
    .eq('kpi_id', kpi_id);
}
```

Additionally, check if **auditor** level needs the same (in some workflows, `audit` is the final stage before management — but `final_score` is typically set by management or the last reviewer before `approved`). Looking at the workflow engine: `resolveForwardStatus('auditor', stages)` returns `'management_review'` or the next stage — so auditor advances to management, not to approved. Only `management` advances directly to `approved`.

**However**, for workflows without a management stage (e.g., `self_l1_hr_pms_audit` ends at audit), `resolveForwardStatus('auditor', stages)` returns `resolveNextStatus('audit', stages)`. If audit is the last stage before approved in that workflow, this would also need final_score syncing.

### Safe Fix: Sync final_rating/final_score Whenever the New Status is 'approved'

```typescript
if (newStatus === 'approved') {
  // Sync final scores to match what was just entered for this role level
  await supabase
    .from('review_submissions')
    .update({
      final_rating: rating || null,
      final_score: score || null,
      kpi_status: 'submitted',
      updated_at: new Date().toISOString(),
    })
    .eq('kpi_id', kpi_id);
}
```

This is workflow-agnostic and safe — regardless of which stage is last, if the status is advancing to `approved`, the entered scores should become the final scores.

### Backfill for Existing Data

The 5 existing approved KPIs with `management_score` but no `final_score` should also be fixed with a migration:
```sql
UPDATE review_submissions rs
SET final_rating = rs.management_rating,
    final_score = rs.management_score
FROM kpis k
WHERE rs.kpi_id = k.id
  AND k.status = 'approved'
  AND rs.management_score IS NOT NULL
  AND rs.final_score IS NULL;
```

---

## Summary of Changes

| # | Issue | Root Cause | Fix |
|---|---|---|---|
| 1 | HR PMS rollback goes nowhere | `notifyUserId` missing in `UnifiedScorecard`'s `RollbackRequestDialog` | Pass employee's reporting chain as notify target; update dialog copy to clarify routing |
| 2 | "No data = zero score" admin feature | Feature doesn't exist yet — UI shortcut needed | Add "Quick Fill: No Data" button in `AdminDataEntryDialog` |
| 3 | Admin last-level data not processed as approved | `final_rating`/`final_score` not synced when status advances to `approved` | Sync final fields in `useAdminDataEntry` when `newStatus === 'approved'`; backfill migration for 5 existing records |

## Files to Modify

| File | Change |
|---|---|
| `src/hooks/useAdminDataEntry.ts` | When `newStatus === 'approved'`, also update `final_rating` and `final_score` in `review_submissions` |
| `src/components/admin/AdminDataEntryDialog.tsx` | Add "Quick Fill: No Data" shortcut button to pre-fill zero-score entry |
| `src/components/review/UnifiedScorecard.tsx` | Pass `notifyUserId` to `RollbackRequestDialog` for HR PMS / reviewer rollback requests |
| New migration SQL | Backfill `final_rating`/`final_score` for 5 existing approved KPIs missing these fields |
| `DOCUMENTATION.md` | Version bump to 1.45.25 |

