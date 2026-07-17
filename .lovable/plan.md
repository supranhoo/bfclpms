## Assumptions
- `authorized_proxy` Assisted Submission writes a `review_submissions` row and then inserts a `notifications` row for the on-behalf-of user.
- That insert fires the `BEFORE INSERT` trigger on `public.notifications` which calls `public.can_send_notification_to(sender, target)`.
- The `can_send_notification_to` body references `k.assigned_to` on `public.kpis` — but the actual column is `k.employee_id` (verified via `information_schema`). Postgres raises `42703 column k.assigned_to does not exist`, the insert fails, and the UI toast surfaces the raw error.

## Risk & Impact Report
- **Data**: none — signature/body change only, no schema drift, no historical data touched.
- **Workflow**: unblocks every non-admin cross-user notification path (assisted submission, observations, queries, reviewer nudges). Admin/HR paths short-circuit at the `has_role` branch above and are unaffected today.
- **UI/UX**: none. Error toast disappears once the insert succeeds.
- **Regression**: low. Same-shape edit as the previous `d.head_id → d.head_user_id` correction in this same function.
- **Scalability**: unchanged — still one bounded index lookup per notification insert.
- **Mitigation**: extend the existing regression test (`src/test/notificationsSenderRelationshipSchema.test.ts`) to also assert `k.employee_id` is used and `k.assigned_to` is not referenced anywhere in the latest `can_send_notification_to` migration.

## Root Cause (5-why)
1. Ayush/Pankaj's assisted submission fails with `column k.assigned_to does not exist`.
2. The notifications BEFORE INSERT trigger calls `can_send_notification_to`, which SELECTs from `public.kpis k` using `k.assigned_to`.
3. `public.kpis` has no `assigned_to` column — the owner column is `employee_id`.
4. Previous hardening migration (`20260717063237` and its re-issue `…064353`) was written from memory of a generic "assignee" model instead of the live schema.
5. Regression guard added last round only checked the `departments.head_user_id` alias, not the `kpis.assigned_to` alias — so this second wrong column slipped through.

## Fix Plan

### Step 1 — Correct the SECURITY DEFINER function (single migration)
`CREATE OR REPLACE FUNCTION public.can_send_notification_to(...)` with the exact current body, changing only:
- line 42: `WHERE k.assigned_to = target` → `WHERE k.employee_id = target`

All other branches (self, admin/HR short-circuit, profiles/departments/BU, annual_review_instances) stay byte-identical. `SECURITY DEFINER`, `STABLE`, `SET search_path = public` preserved.

### Step 2 — Strengthen the regression guard
Extend `src/test/notificationsSenderRelationshipSchema.test.ts` so the "latest can_send_notification_to migration" assertion also fails if:
- `k.assigned_to` appears anywhere in the function body, OR
- `k.employee_id` is missing from the `kpis` branch.

Same test file, additive assertions only — no new file.

### Step 3 — Verification recipe
- Run vitest: `bunx vitest run src/test/notificationsSenderRelationshipSchema.test.ts` — must pass.
- Post-deploy: log in as a plain authenticated user (not admin/HR), open the assisted-submission dialog, click **Verify & Submit**, and confirm the toast now shows success and the notification row appears in the recipient's inbox. Repeat for a KPI observation reply as a smoke test of the same code path.

### Step 4 — Docs / memory sync
- Add ADR-107 (`docs/adr/ADR-107.md`) recording: symptom, 5-why, fix, and the widened regression test.
- Append a bullet to `mem://architecture/database/notification-recipient-guard` noting that every column referenced by `can_send_notification_to` must be verified against `information_schema` before merge (schema-truth check, not memory).

## Not Applicable
- UI changes (backend-only fix)
- Data backfill (no rows were mutated by the failing path)
- Rollback plan beyond re-running the previous migration (function is `CREATE OR REPLACE`, trivially reversible)

## Deliverables on approval
1. New migration: `CREATE OR REPLACE public.can_send_notification_to` with `k.employee_id`.
2. Extended `src/test/notificationsSenderRelationshipSchema.test.ts`.
3. `docs/adr/ADR-107.md` + memory update.
