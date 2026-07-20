## Request
Grant Swastik Kar (employee 102061) access to the **Assisted Annual Review Submission** feature (proxy-submit self review on behalf of blue-collar / non-login employees).

## Current State (verified)
- `profiles`: Swastik Kar, `swastik.kar@bfclalloys.com`, active, dept `541a4085…`.
- `user_roles`: already has `hr_pms`.
- `iac_user_role_assignments`: none.

## Analysis
Per **POLICY §AR-HR-PROXY** and `ANNUAL_REVIEW_TEAM_STATIC_ROLES` (`src/lib/annualReview/teamAccess.ts`), the `hr_pms` role already grants:
- Access to `/team-annual-review` (route guard passes),
- The "Find employee" directory dialog,
- Proxy-submit rights via `can_proxy_submit_annual_review` and `submit_annual_review_self_as_proxy`.

So **no role grant is required** — he technically already has the access. The likely real problem is one of:
1. Feature flag `app_settings.assisted_self_submission_enabled` is OFF (then no one sees the assisted flow).
2. Directory search flag `app_settings.annual_review_directory_search_enabled` is OFF (Find-employee button hidden).
3. Menu visibility: the "Team Annual Review" menu entry is hidden for him via `menu_access_config` / access-profile.
4. He is looking under **My Annual Review** and expects a Team button that lives under **Team Annual Review**.

Before making any change I need to know which of these is the actual blocker — granting a duplicate role or flipping a global flag on a hunch would be exactly the "band-aid" the RCA policy forbids.

## Proposed Plan
Step 1 — Verify the real blocker (read-only, no changes yet):
- Read `app_settings` row for `assisted_self_submission_enabled` and `annual_review_directory_search_enabled`.
- Read `menu_access_config` + any `menu_access_user_overrides` / access-profile assignment for user `c25853e6…` to confirm `Team Annual Review` menu is visible.
- Confirm from Swastik what he sees: no menu item, menu present but no "Find employee" button, or button present but employee not found.

Step 2 — Apply the minimum fix based on Step 1:
- If menu hidden → add menu override for this user (data insert).
- If directory flag off → discuss with admin before flipping (global effect).
- If assisted flag off → same (global).
- If nothing hidden → he already has the access; provide navigation guidance instead of a code/data change.

Step 3 — Regression guard:
- Add a Vitest case asserting `hr_pms` passes `annualReviewTeamAccessAllowed` (existing test already covers this — extend only if a new code path is touched).
- No DB schema change expected, so no migration/rollback plan needed unless Step 2 requires a menu override insert (additive, reversible by deleting the override row).

## Risk & Impact
- **Data:** none in Step 1. Step 2 at most inserts one menu-override row.
- **Workflow:** none unless a global feature flag is toggled (would require explicit approval).
- **UI:** none directly; Swastik would gain visibility of Team Annual Review entry if that's the blocker.
- **Regression:** near-zero for a per-user menu override; high for global flag flips — hence Step 1 gate.

## Ask
Please confirm which of the following Swastik sees today so I can jump straight to the correct fix:
(a) No "Team Annual Review" menu at all,
(b) Menu present but no "Find employee" button,
(c) Button present but the target employee isn't found,
(d) Something else (screenshot helpful).
