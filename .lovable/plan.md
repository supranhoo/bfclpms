## Problem

The Annual Review stepper shows **Ankit Choudhary** as "HR Final" even though **Jaspal** is now the HR BU Head. This happens because `annual_review_instances.hr_id` was frozen at seed time and is never updated when the HR BU Head changes.

## Risk & Impact Report

- **Data Impact:** Updates `hr_id` on existing `annual_review_instances` rows. Only non-finalized instances should be touched to preserve audit trail of completed reviews.
- **Workflow Impact:** In-flight reviews will route to the new HR Final approver instead of the old one. Pending HR-stage approvals re-assign automatically.
- **UI/UX Impact:** Stepper immediately reflects the current HR BU Head. No visual layout change.
- **Regression Risk:** Low if scoped to instances whose HR stage isn't yet completed. Risk of overwriting a deliberate per-instance reassignment (via Reassign Reviewer dialog) — mitigated by skipping rows that have an override record in `annual_review_assignment_overrides` for the HR role.
- **Mitigation:** Audit-log every auto-reassignment; admin toggle controls whether cascade runs; dry-run preview before bulk apply.

## Plan

### 1. Admin Setting (toggle)

Add a new boolean to `annual_review_settings`:

- `auto_reassign_hr_on_bu_head_change` (default: **false** to preserve current behavior)

Surface it in **Annual Review → Admin → Settings → Display Settings** card as a `Switch` with helper text:
> "When HR BU Head changes, automatically re-point HR Final on all non-finalized review instances to the new BU Head."

### 2. One-time Repair Action (immediate fix for current issue)

Add a button in the same Settings card: **"Sync HR Final to current BU Head now"**.

Flow:
1. Click → opens `ConfirmDestructiveDialog` showing a preview count: "X instances will be re-pointed from previous HR to Jaspal (current BU Head)."
2. Confirm → calls a new RPC `sync_hr_final_to_current_bu_head(cycle_id uuid)`.
3. RPC updates `annual_review_instances.hr_id` for rows where:
   - `cycle_id` matches the active cycle
   - HR stage is **not yet completed** (status before `hr_approved` / not finalized)
   - No active override exists in `annual_review_assignment_overrides` for the HR role on that instance
4. Writes one audit row per change to `system_audit_logs` (performer = current admin).

### 3. Going-Forward Cascade (driven by the toggle)

When admin updates `business_units.head_user_id` for the HR BU (via Admin → Organization → Business Units), a DB trigger checks the setting:

- If `auto_reassign_hr_on_bu_head_change = true` → runs the same SECURITY DEFINER function as step 2, scoped to non-finalized instances, with `performed_by = NULL` (system attribution per memory rule).
- If `false` → no change (today's behavior); admins use the manual sync button or per-instance Reassign Reviewer dialog.

### 4. Per-instance fix (no code, available today)

For the immediate Ankit→Jaspal case the admin can also open the instance and use **Reassign Reviewer → HR** with a reason. Documented in DOCUMENTATION.md as the surgical option.

## Technical Details

**Schema:**
```sql
ALTER TABLE public.annual_review_settings
  ADD COLUMN auto_reassign_hr_on_bu_head_change boolean NOT NULL DEFAULT false;
```

**New RPC:** `public.sync_hr_final_to_current_bu_head(p_cycle_id uuid)` — SECURITY DEFINER, admin-only, returns count of updated rows.

**New trigger:** `trg_bu_head_change_cascade_hr` on `business_units` AFTER UPDATE OF `head_user_id` WHEN BU name = 'HR' — calls the same function gated by the setting.

**Frontend:**
- `src/hooks/useAnnualReviewSettings.ts` — extend with `useAutoReassignHrOnBuHeadChange` getter/setter.
- `src/pages/annual-review/AnnualReviewAdmin.tsx` — add Switch + "Sync now" button in Display Settings card.
- New service `src/services/annualReview/hrFinalSync.ts` — wraps the RPC.

**Tests:**
- Unit: toggle hook, RPC scope (skips finalized, skips overrides), trigger gated by setting.
- Mock data: cycle with mix of in-progress, finalized, and overridden instances.

**Docs:**
- DOCUMENTATION.md → "HR Final resolution" section: add toggle + manual sync + per-instance override hierarchy.
- POLICY.md → "When HR BU Head changes": describe default (preserve), opt-in cascade, and immutability of finalized HR stage.

## Rollback

- Toggle defaults to `false` — no behavior change on deploy.
- Repair action is opt-in (admin must click).
- Trigger is a no-op when toggle is off; can be dropped without data loss.
- Each update is audit-logged so individual rows can be reverted if needed.
