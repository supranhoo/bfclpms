## Goal
Restore the assisted-submission entry point on `/annual-review/team` for **Reporting Managers** and **Skip-Level Managers**, scoped to their own reports. Confirmed on employee 101187 (role `manager`, 11 direct reports, not BU Head / HOD): the server resolver `annual_review_directory_access` returns `{can_access:false}`, so `TeamAnnualReview.tsx` line 285 never renders the button.

The resolver was never widened for plain managers — today's other fixes (BU-Head-terminal, reviewer resync, team-queue auth RPC) don't touch it, but the button behaviour you saw this morning matches a manager-inclusive rule. We'll add that rule.

## Root cause
`public.annual_review_directory_access(uid)` only returns `can_access:true` for Admin / HR PMS / HR-BU members / BU Heads / HODs. Plain Reporting Managers and Skip-Level Managers are denied even though they own the review queues for their reports. Client is a pure passthrough — the fix is server-side.

## Risk & Impact
- **Data:** no schema change. New scope value `'team'` added to the resolver's JSON output.
- **Workflow:** no change to review stages, BU-Head-terminal (ADR-109), or queue retrieval (§AR-TEAM-QUEUE-AUTH). Managers only gain the ability to initiate/assist a `pending_self` instance for their own reports; downstream routing is unchanged.
- **Security:** enforcement stays server-side. The same resolver already gates `search_active_employees_for_review` and `create_or_get_annual_review_instance`; both get a `scope='team'` branch that filters to the caller's direct + skip reports. A manager cannot see or create for anyone outside their reporting subtree.
- **UI:** one additional button (variant="outline", `UserPlus` icon) appears for previously-denied managers. Label per scope: `all` → "All employees", `bu` → "BU employees", `team` → **"Team employees"**.
- **Regression:** first-match order in the resolver is preserved (admin → hr_pms → hr_bu → bu_head → hod → **team**), so users who currently resolve to `all` / `bu` keep that exact scope. Verified: 101187 currently `false` → after change resolves to `scope='team'`.

## Plan

### 1. Backend — one migration
- Extend `public.annual_review_directory_access(v_uid)`:
  - Append rule 6: if `v_uid` has ≥1 active direct report (`profiles.reporting_manager_id = v_uid AND is_active`) OR ≥1 active skip report (two-hop) OR appears as `manager_id` / `skip_id` on any `annual_review_instances` row in the active cycle → return `{ can_access:true, scope:'team', business_unit_id:null }`.
- Extend `public.search_active_employees_for_review(...)`:
  - `scope='team'` branch: restrict results to employees whose `reporting_manager_id = v_uid`, whose reporting manager's `reporting_manager_id = v_uid` (skip), or who have an AR instance with `manager_id=v_uid` / `skip_id=v_uid` in the given cycle.
- Extend `public.create_or_get_annual_review_instance(...)`:
  - `scope='team'` branch: same predicate; reject with a clear `RAISE` when the target is outside the manager's subtree.
- Audit: `annual_review.instance.auto_created` records `actor_scope='reporting_manager'` when the caller resolved via rule 6.

### 2. Frontend
- `src/hooks/useDirectoryAccess.ts`: widen `DirectoryAccessScope` to `'all' | 'bu' | 'team'`.
- `src/pages/annual-review/TeamAnnualReview.tsx` (line 285-299): add a third label branch for `scope === 'team'` → **Team employees**, tooltip "Search your direct and skip-level reports and start a review to assist with form filling." No change to the existing `directoryEnabled` gate — the same `annual_review_directory_search_enabled` app_setting flag still governs the whole feature.
- `EmployeeDirectoryDialog` needs no change (it just calls the RPC).

### 3. Governance
- Update `POLICY.md` §AR-DIRECTORY-ACCESS-MATRIX with rule 6 and the invariant "scope='team' never exposes employees outside the caller's reporting subtree".
- Update `mem://features/annual-review/directory-access.md` to mirror the new row.
- New `docs/adr/ADR-110.md` — "Reporting/Skip-Level Manager access to assisted submission directory": decision, alternatives, rollback.

### 4. Tests
- `src/test/annualReview/teamAccess.test.ts`: add coverage for `scope='team'`.
- `src/test/annualReview/employeeDirectory.test.ts`: mock resolver returning `scope='team'`; assert search RPC is invoked and `create_or_get_annual_review_instance` rejects an out-of-team employee.
- Resolver precedence: a BU Head who is also a reporting manager still resolves to `scope='bu'` (first-match wins; no regression).
- Post-migration verification (psql read): `annual_review_directory_access('<101187 uid>'::uuid)` returns `{can_access:true, scope:'team'}`.

### 5. Rollback
Additive only — reverting the migration restores the prior resolver body and the label branch becomes dead code. No data cleanup required; instances created via `create_or_get_annual_review_instance` are indistinguishable from any other AR instance.

## UI Changes
- Location: `/annual-review/team`, top filter row, right side (existing slot at line 285).
- Before: managers like 101187 see no button.
- After: same slot shows outline button **Team employees** with `UserPlus` icon → opens existing `EmployeeDirectoryDialog` restricted to their reports.
- No layout / spacing / responsive change.

## Out of scope
- No change to who can *review* (stage routing).
- No change to `assisted_self_submission_enabled` or `annual_review_directory_search_enabled` global flags.
- No change to BU-Head-terminal (ADR-109) or team-queue RPCs (§AR-TEAM-QUEUE-AUTH).
