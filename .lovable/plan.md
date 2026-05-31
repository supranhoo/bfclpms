# RCA & Fix — "View Only" badge on closed months despite Legacy/Global Lock = Open

## What you're seeing
- **Image 1:** KPI of Anil Kumar Pathak for Sep 2025 shows `Approved · View Only` and Admin Data Entry won't accept score changes.
- **Image 2:** Review Period Governance for Sep 2025 shows `Legacy Lock 🔓 Open`, `Global Lock None`, but `Current Stage = Closed`.

The two screens look contradictory — but they're reading **three different** lock systems.

## Root Cause

There are three independent "lock" concepts in the system:

| # | Concept | Source field | Shown in Governance UI as |
|---|---|---|---|
| 1 | Legacy lock | `review_periods.is_locked` (boolean) | "Legacy Lock 🔓 / 🔒" |
| 2 | Global / role / dept / employee lock | rows in `review_period_locks` | "Global Lock: None / Active" |
| 3 | **Stage machine** | `review_periods.current_stage` | "Current Stage: Closed" (not surfaced as a lock) |

The "View Only" badge and the Admin Data Entry write-block both come from one RPC: `public.check_review_period_permission`. That RPC's logic order is:

```text
1. IF current_stage = 'closed'  → return view_only=true / edit_scores=false   ← short-circuits EVERYONE
2. IF user is admin            → return default (open)                        ← never reached when closed
3. Check employee / dept / role / global locks (review_period_locks)
```

Because Sep 2025 was advanced to `current_stage = 'closed'` (visible in the Stage Progress strip in image 2), step 1 fires and returns `view_only = true` for **every user including admins**, regardless of Legacy Lock or Global Lock being open. The DB trigger `prevent_locked_submission_updates` has the same ordering bug — it correctly bypasses admins for the Legacy lock, then re-calls the broken RPC and re-blocks admins.

So:
- **Legacy Lock open + Global Lock none + Stage = Closed → admin still blocked.** Working as coded, but the code is wrong: admin should be exempt from the stage gate just like they are exempt from the legacy lock.
- The Governance Overview screen also hides the real culprit: `Current Stage = Closed` is shown as a small chip in "Current Stage" but not in the "Locks" row, so an admin reasonably concludes nothing is locked.

Evidence:
- `src/components/review/KpiHeaderSection.tsx:68-135` renders the View Only badge purely from `useReviewPeriodPermissions(...).view_only` — no admin override.
- `src/hooks/useReviewPeriodPermissions.ts:43-87` calls the RPC for every action; no admin short-circuit on the client.
- `supabase/migrations/20260307072435_*.sql` `check_review_period_permission`: `IF v_current_stage = 'closed'` block runs **before** the admin role check.
- `supabase/migrations/20260314145515_*.sql` `prevent_locked_submission_updates`: bypasses legacy lock for admin, then re-calls the same RPC.

## Risk & Impact Report

- **Data Impact:** None. RPC logic change only; no schema, no historical row mutation.
- **Workflow Impact:** Admins regain the ability to edit/score KRAs in `closed` periods. Non-admin users remain fully blocked exactly as today.
- **Regression Risk:** Low. Two surfaces use this RPC — Self/Manager/Approval screens (still blocked because they check role-specific actions like `submit_self_review`, which the admin role does not have via the role-locks path) and KpiHeaderSection/Admin Data Entry (intended target). The DB triggers fan in to the same RPC, so once the RPC is fixed the triggers automatically respect it.
- **Security:** Admin already has full row-level UPDATE rights everywhere else; the closed-stage gate is purely a governance UX safety net, not a security boundary. Every admin edit on a closed period is still captured in the immutable audit log (`pms-audit-log` / `kpi_audit_logs`) and `final_score` immutability rules still apply (admin must explicitly Step Back from `approved` first if they want a *different* final value).
- **Scalability:** Zero query cost change (one short branch moved).
- **Mitigation:** Add a Governance Overview banner that clearly labels `Current Stage = Closed` as a third lock, and add an explicit "Closed period" warning inside the Admin Data Entry dialog so the admin acknowledges they are editing a closed month.

## Fix Plan

### 1. SQL migration — reorder the RPC

Move the admin bypass to run **before** the `closed` short-circuit. Same shape as the legacy-lock trigger that already exempts admins.

```sql
CREATE OR REPLACE FUNCTION public.check_review_period_permission(
  p_user_id uuid, p_period_name text, p_review_year int, p_action text
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_current_stage text;
  v_user_roles text[];
  v_default_value boolean := (p_action <> 'view_only');
BEGIN
  SELECT current_stage INTO v_current_stage FROM review_periods
   WHERE period_name = p_period_name AND review_year = p_review_year;

  SELECT array_agg(role::text) INTO v_user_roles FROM user_roles WHERE user_id = p_user_id;

  -- ① Admin bypass BEFORE stage gate (was step 2, now step 1)
  IF 'admin' = ANY(COALESCE(v_user_roles, ARRAY[]::text[])) THEN
    RETURN v_default_value;
  END IF;

  -- ② Closed-stage short-circuit for everyone else
  IF v_current_stage = 'closed' THEN
    RETURN (p_action = 'view_only');
  END IF;

  -- ③ employee / dept / role / global lock checks (unchanged)
  ...
END;
$$;
```

No grants change. No data backfill. Other functions (`prevent_locked_period_updates`, `prevent_locked_submission_updates`) automatically benefit because they fan into this RPC.

### 2. Frontend — make the lock source explicit (no behaviour change for non-admin)

- `src/components/management/ReviewPeriodOverview.tsx`: add a third pill **"Stage Lock"** next to Legacy Lock / Global Lock that reads `period.current_stage === 'closed' ? 'Active (Closed)' : 'None'`. Solves the visual contradiction the user reported.
- `src/components/review/KpiHeaderSection.tsx`: when `period.current_stage === 'closed'` AND user is admin, render an amber **"Closed period — admin override"** badge instead of the red "View Only" pill. Admins keep the visual cue that this is a sensitive edit.
- `src/components/review/AdminDataEntryDialog.tsx` (or equivalent): when the period is closed, show an inline warning `"This month is Closed. Saving will modify a finalised period and will be recorded in the audit log."` with a "Proceed" confirmation before enabling Save. Reuses `ConfirmDestructiveDialog`.

### 3. "How to change the score of a closed month" — supported procedure

After the fix, two equivalent admin paths exist; pick whichever matches the desired audit trail:

1. **Quickest (single KPI):** open the KRA → click **Admin Data Entry** → acknowledge the "Closed period" warning → edit score → Save. Audit log captures `performed_by = admin`, `period_stage_at_edit = closed`.
2. **Reopen the whole month (multiple KPIs):** Review Period Governance → Stages → **Step Back** from `Closed` to `Approval` (or earlier). Edit normally. Re-advance back to `Closed` when done. This is the right path when many KPIs need editing or when `final_score` itself needs to change (Step Back also unfreezes `final_score`).

We will surface both options inline in the new "Stage Lock" pill tooltip so admins know which to use.

## Implementation Order

1. New migration `…_admin_bypass_before_closed_stage.sql` updating `check_review_period_permission` (logic-only, idempotent `CREATE OR REPLACE`).
2. Frontend updates:
   - `ReviewPeriodOverview.tsx` — add Stage Lock pill.
   - `KpiHeaderSection.tsx` — render amber "Admin override" for admins on closed periods.
   - Admin Data Entry dialog — closed-period confirmation step.
3. Unit tests:
   - `src/lib/permissions/__tests__/checkReviewPeriodPermission.test.ts` — mock RPC contract: admin returns `view_only=false` and `edit_scores=true` on closed period; non-admin still blocked.
   - Component test: `KpiHeaderSection` renders "Admin override" pill for admin + closed, "View Only" for non-admin + closed, no pill when stage open.
4. DOCUMENTATION.md: update Review Period Governance section with the three-lock model and the "edit closed month" procedure.
5. POLICY.md: clarify "Admins may edit any period at any stage; every closed-period edit is captured in the audit log; `final_score` immutability still requires explicit Step Back."
6. Update memory `mem://features/admin/review-period-governance-system` with the new three-lock model + admin-bypass-before-stage-gate rule.

## Rollback
Single SQL function — revert with `CREATE OR REPLACE` restoring the original order. Frontend pill is additive; remove file/lines if not wanted.

## Tests / Verification
- Manual: log in as admin → Sep 2025 → Anil Kumar Pathak's KPI → confirm no "View Only" pill, Admin Data Entry accepts a new score, audit log entry appears.
- Manual: log in as employee/manager → same KPI → still "View Only", save still blocked.
- Automated: vitest unit test against mocked RPC + KpiHeaderSection role matrix.
