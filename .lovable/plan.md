## Assumptions
- Live DB has already been repaired: `public.can_send_notification_to(uuid,uuid)` uses `d.head_user_id` (verified — no function, view, policy, or trigger in `public` references `d.head_id` or bare `head_id`).
- The screenshots showing "column d.head_id does not exist" are from the pre-repair state (before migration `20260717122200_49e4d033…` was applied). No new occurrences have been reproduced against the current schema.
- Scope of this task: institutionalize the fix — RCA record, regression guards, tests, documentation — not another data migration.

## Risk & Impact Report
- **Data Impact:** None. No schema or data changes.
- **Workflow Impact:** None. Notification authorization matrix already restored.
- **UI/UX Impact:** None.
- **Regression Risk:** Medium if not guarded — a future migration could reintroduce `d.head_id` or another non-existent column and silently break notification inserts across audit/self/annual-review save paths. Mitigated by (a) a schema-validation unit test and (b) a runtime smoke test invoking `can_send_notification_to` for representative role pairs.
- **Scalability Impact:** None; guards are O(1) at test/CI time.
- **Rollback:** Pure additive (tests + docs). Delete the added files to revert.

## Root Cause (5-why summary)
1. Users saw "column d.head_id does not exist" on Save/Send-back → notification INSERT failed.
2. The failing INSERT invoked `can_send_notification_to(...)` in an RLS policy / BEFORE trigger.
3. A prior migration (`20260717120422_159c1980…`) redefined that function referencing `departments d.head_id`.
4. `public.departments` has `head_user_id`, not `head_id` — the function's column reference was invalid.
5. Function code was authored from stale schema memory; no schema-validation test caught it before deploy.

Current state: superseded by `20260717122200_49e4d033…` which restored the bidirectional matrix using the correct `d.head_user_id`. Verified via `pg_get_functiondef` and `pg_proc` scan (only one overload exists).

## Plan
1. **Regression test — schema validity of notification-authorization function.**
   `src/tests/canSendNotificationToSchema.test.ts`: query `pg_get_functiondef('public.can_send_notification_to'::regproc)` shape via a mocked supabase client and assert the definition:
   - references `head_user_id` (not bare `head_id`),
   - references `audit_kpi_assignments` and `audit_kpi_level_assignments`,
   - contains bidirectional `sender`/`target` branches for org hierarchy, KPI reviewers, and annual-review reviewers.
2. **Regression test — behavioural matrix.**
   `src/tests/notificationsSenderRelationshipMatrix.test.ts` (extend existing): cover self→self, admin↔any, manager↔subordinate, dept-head↔member, bu-head↔member, kpi-reviewer↔assignee, ar-reviewer↔employee, ar-peer↔ar-peer, unrelated→denied.
3. **Migration-linter guard (source-side).**
   `scripts/check-migrations-schema.mjs` run in `bun test`: scans `supabase/migrations/*.sql` for forbidden identifiers (`departments…head_id\b`, `kpi\.…` alias without joined table, etc.) and fails CI on match. Denylist is data-driven via `scripts/forbidden-columns.json` so future columns can be added without code changes.
4. **DOCUMENTATION.md** — append v2.66.114 entry: RCA, CAPA, verification steps, links to test files.
5. **POLICY.md** — reaffirm §108b (bidirectional notification matrix) and add §108c: "Every migration that redefines `can_send_notification_to` must be accompanied by the schema-validity test in step 1."
6. **Post-verify** — after tests pass, re-run `can_send_notification_to` for the Jitendra→Gaurav pair via `supabase--read_query` (using a service-role wrapper query) to confirm `true`, and instruct the user to reload the Audit Review page.

## UI Changes
Not Applicable.

## Files Touched
- `src/tests/canSendNotificationToSchema.test.ts` (new)
- `src/tests/notificationsSenderRelationshipMatrix.test.ts` (new or extended)
- `scripts/check-migrations-schema.mjs` (new)
- `scripts/forbidden-columns.json` (new)
- `DOCUMENTATION.md` (append v2.66.114)
- `POLICY.md` (append §108c)

## Out of Scope
- No new DB migration (live function already correct).
- No UI, RLS, or table changes.
- No rollback of prior migrations — historical files are retained as source-of-record.

Approve to switch to build mode and implement.