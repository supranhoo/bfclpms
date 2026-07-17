## Incident
Ayush hit **`ERROR: column d.head_id does not exist`** when adding an observation on a KPI. The failure surfaces as a red toast on the Audit Review page but actually originates in the database, blocking the notification insert that fires after the observation is saved.

## Root Cause
Yesterday's migration `20260717063237_..._notifications_enforce_sender_relationship.sql` (the SECURITY DEFINER hardening we shipped for the notifications INSERT finding) added a helper `public.can_send_notification_to(sender, target)`. Inside its "direct organizational relationships" branch, it references `d.head_id` on `public.departments`. That column does not exist — the real column is `head_user_id` (verified against `information_schema`; the sibling `business_units.head_user_id` lookup on the very next line is correct).

Because the helper runs inside a BEFORE INSERT trigger on `public.notifications`, every authenticated cross-user notification insert now fails at planning time with `42703 column d.head_id does not exist`. Admin/HR paths are unaffected (they short-circuit at the `has_role` check above), which is why the regression wasn't caught during the initial smoke test.

## 5-Why
1. **Why did the observation fail?** The notification insert that follows the observation raised `column d.head_id does not exist`.
2. **Why did the insert raise that error?** The `can_send_notification_to` helper referenced a non-existent column on `departments`.
3. **Why did the helper reference a non-existent column?** The migration was written from memory ("dept head lives on `departments.head_id`") instead of from schema, and the inline comment "if column exists on departments" reveals the author already knew it was a guess.
4. **Why wasn't the typo caught before ship?** The trigger only executes for non-admin, non-HR senders, and the post-migration verification was run as admin — the failing branch was never planned.
5. **Why was verification blind to that branch?** We have no lint/CI step that asserts every column referenced in a new migration exists in the live schema, and no negative-path smoke test that exercises the trigger as a plain authenticated user.

## Fix (Corrective Action)
Ship a single one-line migration that `CREATE OR REPLACE`s `public.can_send_notification_to` with `d.head_user_id` in place of `d.head_id`. Function signature, grants, trigger binding, and every other branch stay identical, so no dependent objects churn.

## Preventive Action (CAPA)
1. **Schema-truth guard test** — add `src/test/notificationsSenderRelationshipSchema.test.ts` that reads the latest migration touching `can_send_notification_to` and asserts:
   - it references `d.head_user_id`, never `d.head_id`;
   - every `<alias>.<column>` on `departments` / `business_units` / `profiles` / `annual_review_instances` / `kpis` appears in a hard-coded allow-list of known columns.
   This catches the same class of typo (wrong column name in a SECURITY DEFINER helper) at CI time.
2. **Negative-path verification recipe** — extend `mem/architecture/database/notification-recipient-guard` with a "post-deploy check" note: after any change to the notifications trigger, run one insert as a plain authenticated user in addition to admin, because the admin short-circuit hides column errors deeper in the function.
3. **Docs sync** — record the fix + 5-why in `docs/adr/ADR-106.md` and cross-link from POLICY §(notifications hardening) so the next migration author sees the trap.

## Verification
- Re-open Ayush's KPI as a non-admin, add an observation → toast should be green, `notifications` row created, no `42703`.
- New vitest passes; existing suites unchanged.

## Not Applicable
- UI changes (server-only fix).
- Data backfill (no rows written incorrectly — inserts failed outright).
- Rollback plan beyond re-running the previous CREATE OR REPLACE (function is idempotent).
