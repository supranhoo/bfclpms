# BUG-037: Copy KRAs Fails for Non-Login Users

## Root Cause Analysis

**Error:** `insert or update on table "notifications" violates foreign key constraint "notifications_user_id_fkey"`

**Trigger chain:**
1. Admin uses Copy KRAs to assign 12 KPIs to **Rahul Kumar Prasad (101941)**.
2. `INSERT INTO public.kpis ...` fires the `trigger_notify_kpi_created` trigger.
3. Trigger function `notify_on_kpi_created()` inserts into `public.notifications` with `user_id = NEW.employee_id`.
4. `notifications.user_id` is `FOREIGN KEY ... REFERENCES auth.users(id)`.
5. Rahul is a **non-login user** (`profiles` row exists, but no `auth.users` row — `auth_email IS NULL`).
6. FK violation aborts the entire transaction → all 12 KPIs roll back → "Copy Failed" toast.

**Verified via DB:**
- Rahul's profile id `fa29fcb0-...` has no matching `auth.users` row.
- Per memory `mem://features/admin/non-login-user-provisioning`, non-login users are an explicitly supported class — but our notification triggers don't account for them.

**Scope of impact:** Every code path that inserts a KPI (or any other row whose AFTER INSERT trigger writes to `notifications`) for a non-login user is broken. This includes Copy KRAs, Smart KRA Assignment, Bundle Assignment, manual KRA creation, KRA Library propagation, and rollover.

## Fix

### 1. Database — Guard all notification triggers (primary fix)

Add a one-line existence check at the top of every notification-emitting trigger function so non-login recipients are silently skipped instead of aborting the transaction.

Affected functions (latest definition for each):
- `notify_on_kpi_created` — guard `NEW.employee_id`
- `notify_on_kpi_status_change` — guard each computed recipient (`v_recipient_id`) before INSERT
- Any other `INSERT INTO public.notifications` inside a trigger function (audit during migration; e.g., observation/query notification helpers)

Pattern:
```sql
IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_recipient_id) THEN
  -- non-login user; skip notification, do not abort the parent transaction
  RETURN NEW;  -- or CONTINUE in loops
END IF;
```

For loops over multiple recipients, wrap each INSERT individually so one non-login recipient doesn't block notifications to login peers.

### 2. Defense-in-depth — Wrap notification INSERT in `BEGIN ... EXCEPTION`

Inside each trigger, wrap the `INSERT INTO notifications` in a `BEGIN ... EXCEPTION WHEN foreign_key_violation THEN NULL; END;` block. This ensures any *future* FK regression (or race where the user was just deactivated) never aborts the originating business transaction. Notification delivery is best-effort by policy.

### 3. Repair audit log

Insert a `RECONCILE_NOTIFICATION_TRIGGER` audit row documenting the fix and listing the bypass condition, per POLICY §106-style invariant pattern.

### 4. Regression tests (`src/test/bugBountyFixes.test.ts`)

Add **BUG-037** suite:
- Copying KRAs to a non-login profile succeeds and creates all KPIs.
- A non-login user receives 0 notifications (silent skip).
- A login peer copied in the same batch still receives notifications.
- KPI status transitions for a non-login employee no longer raise FK errors.

### 5. Policy & docs

- **POLICY.md §108** — "Notification Recipient Resolution": notification triggers MUST verify the recipient exists in `auth.users` before insert. Non-login users are valid notification *no-ops*, never failures.
- **DOCUMENTATION.md** — bump to v2.66.7.39 with BUG-037 entry under Bug Fixes & Architecture.
- **mem/architecture/database/notification-recipient-guard** (new) — codify the auth-existence guard pattern.
- **mem/index.md** — append reference.

## Risk & Impact Report

- **Data Impact:** None. Trigger logic only; no schema, RLS, or historical data changes.
- **Workflow Impact:** Notifications for non-login users are silently dropped (correct — they have no inbox). All other notification flows preserved.
- **UI/UX:** None. The Copy KRAs dialog will now succeed for non-login targets.
- **Regression Risk:** Low. The guard is additive (`IF NOT EXISTS ... RETURN`); the EXCEPTION wrapper only catches FK violations on the notifications table.
- **Mitigation:** New regression tests + audit log row + POLICY §108 to prevent re-introduction.

## Files to change

- `supabase/migrations/<timestamp>_guard_notification_triggers_for_non_login_users.sql` (new)
- `src/test/bugBountyFixes.test.ts`
- `POLICY.md`, `DOCUMENTATION.md`
- `mem/index.md`, `mem/architecture/database/notification-recipient-guard` (new)
