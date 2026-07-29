## Assumptions
- Request refers to the **Password** tab of the user access sheet (`UserAccessSheet.tsx`), which today renders only "Last rollout".
- History should be **per-user** (this sheet's user), newest first, and include who performed it.
- No schema change is required: `password_rollout_logs` already stores every attempt (`created_at`, `status`, `email_sent`, `email_error`, `error_message`, `generated_by`).

## Clarifications
None blocking. If you also want a global (all-users) rollout history screen, say so — that is a separate surface (`PasswordPolicyTab`) and not in this plan.

## Risk & Impact Report
- **Data impact**: None. Read-only additional query; no schema, RLS or trigger change.
- **Workflow impact**: None. Generate buttons behave exactly as before.
- **UI/UX impact**: The "Last rollout" block becomes "Rollout history" — a compact, scrollable, paginated list inside the same panel; latest entry still first and visually emphasised.
- **Regression risk**: Low, isolated to `PasswordPanel`. The existing `['password-rollout-last', user.id]` cache key is replaced, so the post-generate invalidation must be updated in the same edit or the list will look stale.
- **Scalability**: Server-side pagination with `.range()` (page size 10) plus `count: 'exact'` — never loads the full log. Query is indexed by `user_id` + `created_at` ordering.

## Plan
1. **Data hook** — add `usePasswordRolloutHistory(userId, page)` (in `src/hooks/usePasswordRollout.ts`) that selects `id, created_at, status, email_sent, email_error, error_message, generated_by` from `password_rollout_logs` where `user_id = :id`, ordered `created_at desc`, with `.range(page*10, page*10+9)` and exact count.
   *Verification*: hook returns rows + `totalCount`; unit test with a mocked client asserts range math and ordering.
2. **Performer names** — resolve distinct `generated_by` ids to `full_name`/`employee_code` via a single `profiles` `in()` lookup for the current page only, falling back to "System" when unresolved.
   *Verification*: unit test covers unresolved id → "System".
3. **UI** — replace the "Last rollout" section in `PasswordPanel` with "Rollout history": a bordered list of rows (timestamp · status badge · email sent / error · performed by), the newest row highlighted as "Latest", empty state kept ("No rollout has been performed for this user."), and a footer with `Showing X–Y of N` plus Prev/Next buttons (disabled at bounds, spinner while fetching).
   *Verification*: manual check on a user with multiple rollouts; empty state check on a user with none.
4. **Cache correctness** — after a successful generate, invalidate `['password-rollout-history', user.id]` and reset to page 0.
   *Verification*: generate a password and confirm the new entry appears at top without reload.
5. **Docs & policy** — add ADR-201 (per-user rollout history visibility, pagination mandatory) and append the version history entry in `DOCUMENTATION.md`; add a line to `POLICY.md` under credential-rollout governance stating rollout logs are immutable and fully visible to admins with `pms.users.password_rollout`.

## UI Changes
- **Location**: user access sheet → **Password** tab, bottom section (currently "Last rollout").
- **Visual**: heading becomes "Rollout history"; card list of up to 10 entries, max-height with internal scroll on mobile; each row: date-time (muted, xs), status badge (`success` outline / else destructive), "Email: sent / not sent / <error>", "By: <name>".
- **Interaction**: Prev/Next pagination; buttons disabled during fetch; no change to the two generate buttons above.
- **Responsiveness**: single-column stack, list rows wrap; touch targets ≥ 40px for pagination buttons.

## Tests
- `src/hooks/__tests__/passwordRolloutHistory.test.ts`: range/pagination math, descending order, empty result, error propagation, performer-name fallback.

## Post-implementation notes
Rollout logs are append-only; nothing in this change writes to them. Rollback = revert the `PasswordPanel` section and hook (no data migration).
