## Goal
Split "Assisted Self-Submission" from "Directory Search" so each capability is governed by its own role-based policy, and enforce strict scoping so a manager can never assist an employee outside their own reporting subtree — even within the same Business Unit.

## Current state (verified)
- `annual_review_directory_access(uid)` returns a single `{can_access, scope, can_assist, business_unit_ids, source}` bundle. `can_assist` currently defaults to `true` for every non-denied path (Admin, HR PMS, HR BU, BU Head, HOD, Reporting/Skip Manager).
- `can_proxy_submit_annual_review(instance, proxy)` gates the actual assisted submit. It honors the resolver's scope but the same `can_assist=true` blanket means a BU Head or HOD can assist anyone in their BU, and a manager can assist anyone in their subtree.
- Admin overrides table `annual_review_directory_overrides` exists (grant_all / grant_bu / grant_team / deny) with a `can_assist` boolean — already the right shape, just under-used.
- Kill-switches: `app_settings.annual_review_directory_search_enabled` and `assisted_self_submission_enabled` (global on/off).
- New Access Control tab is wired but only exposes kill-switches + overrides; no per-role capability matrix.

## Problem
1. "Directory search" and "Assisted submit" are conflated in one boolean per source — cannot say "Managers can search their team but only HR/Admin can assist".
2. Assist scope for managers is the whole reporting subtree; there is no explicit "direct reports only" tightening, and no cross-department guardrail beyond the subtree check.
3. No admin-visible capability matrix — policy lives in SQL only.

## Plan

### 1. Data model — capability matrix (additive, no destructive changes)
New table `annual_review_role_capabilities`:
- `role_source` text — one of `admin`, `hr_pms`, `hr_team`, `bu_head`, `hod`, `reporting_manager`, `skip_manager`.
- `can_search` boolean (directory visibility).
- `can_assist` boolean (proxy self-submit).
- `assist_scope` text — `same_as_search` | `direct_reports_only` | `none`.
- Audit columns + `updated_by`.

Seeded defaults preserve today's behavior *except* assist rights, which tighten to:
- Admin / HR PMS / HR Team → search=true, assist=true, scope=same_as_search.
- BU Head / HOD → search=true, assist=**false** (opt-in via override or capability toggle).
- Reporting Manager → search=true, assist=**false** by default; when enabled, `assist_scope=direct_reports_only`.
- Skip Manager → search=true, assist=false.

Overrides table stays as the per-user escape hatch and continues to win over role defaults.

### 2. Resolver split
Replace the single `annual_review_directory_access` return with two logical answers, still one RPC for the client:
- `can_search` + `search_scope` + `search_bu_ids`.
- `can_assist` + `assist_scope` + `assist_bu_ids` + `assist_subtree_only` flag.

Precedence: `deny` override → explicit `grant_*` override (with its own `can_assist`) → role capability row → deny.

### 3. Assist enforcement (server SSOT)
Rewrite `can_proxy_submit_annual_review(instance, proxy)` to:
1. Read the resolver's assist answer for `proxy`.
2. If `assist_scope='direct_reports_only'` → allow only when the target employee's `reporting_manager_id = proxy`.
3. If `assist_scope='same_as_search'` with `scope='bu'` → allow only when target's BU ∈ resolver's `assist_bu_ids` **and** the target's department head or reporting manager is not in a different BU than the proxy's headed BUs (blocks "same BU, different department manager" leakage).
4. If `scope='team'` → allow only when target is in `annual_review_subtree_ids(proxy)`.
5. Admin/HR PMS/HR Team unchanged.

The existing `submit_annual_review_self_as_proxy` RPC keeps calling this guard, so the API surface doesn't change.

### 4. Directory search enforcement
`search_active_employees_for_review` already re-checks scope; update it to use `can_search`/`search_scope` (not `can_assist`) and to return a per-row `can_assist_this_employee` flag so the UI can hide the "Assist" button when search is allowed but assist is not.

### 5. Admin UI — Access Control tab
Add a third section under the existing tab:
- **Role capability matrix**: table of the 7 role sources × [Can search, Can assist, Assist scope]. Toggles + dropdown, reason required on save, writes to audit log.
- Keep existing kill-switches and per-user overrides sections unchanged.
- Access trace inspector already exists — extend `get_annual_review_access_explain` output to show which capability row and/or override produced each answer.

### 6. Client
- `useDirectoryAccess` returns both `search` and `assist` blocks.
- `EmployeeDirectoryDialog` hides the "Assist" action per row using `can_assist_this_employee`.
- `AssistedSubmissionDialog` continues to rely on `useProxyEligibility` — no change; the server RPC does the real work.

### 7. Migration & rollback
- Additive migration: new table + updated functions with `CREATE OR REPLACE`. Old function signatures preserved.
- Backfill capability rows with today's effective behavior for Admin/HR paths (assist=true) and default managers to assist=false to close the leak. Existing per-user overrides continue to grant assist where explicitly set.
- Rollback = drop new table + restore prior function bodies (kept in the migration file's rollback section).

### 8. Tests
- SQL: unit tests for `can_proxy_submit_annual_review` across all 7 role sources and cross-BU / cross-department negative cases.
- Vitest: `useDirectoryAccess` returns split blocks; `EmployeeDirectoryDialog` hides assist correctly.
- Regression: existing `directoryAccess.test.ts` extended for the new shape.

### 9. POLICY / ADR
- New ADR "Split search vs assist capability".
- POLICY §AR-DIRECTORY-ACCESS-MATRIX updated to reference the capability table as SSOT for defaults, overrides as exceptions.

## Explicit non-goals
- No change to who can *view* a submitted review.
- No change to the selfie / declaration flow.
- No change to kill-switch behavior.

## Open question
Should a Reporting Manager, when enabled, be able to assist **direct reports only** (recommended) or the full reporting subtree (skip-reports included)? Default in this plan is direct-reports-only; confirm before build.
