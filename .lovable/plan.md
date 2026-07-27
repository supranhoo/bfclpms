## Goal

Unblock every annual review whose current stage points at an inactive or unmapped reviewer, remap the succession to Amit Kumar Sharma (102050), and add a permanent Admin console so this class of orphan can never sit silently again.

## Verified current state

Queried live data this turn:

- **14 instances** are stuck on inactive reviewer **Dinesh Chandra Chaudhary (101969)**:
  - `pending_bu` (13): 100759, 100890, 101149, 101200, 101769, **101851**, 101942, 101959, 101961, 101997, 102008, 102009, 200449
  - `pending_dept` (1): 100010
- Org master still names Dinesh as head of BUs **Corporate Affairs** and **EHS**, plus departments **Corporate Affairs - Land**, **Corporate Affairs-Legal**, **BFCL-Corporate Communication**, **Corporate Affairs-Corporate Communication** — deactivation never triggered a successor remap, which is the root cause.
- **12 instances** sit at `pending_self` with no reviewer mapped for the stage (separate orphan class).
- Successor **102050 — Amit Kumar Sharma** exists, is active, sits in Corporate Affairs-Legal / Corporate Affairs BU.

## Risk & impact

- **Data:** additive only. New detection view/RPC + an audit table; the repair writes reviewer ids and (where needed) status, all snapshotted before/after.
- **Workflow:** the 14 employees' BU/Dept stage owner changes from Dinesh to Amit. No scores are cleared; locked responses stay locked. Follows POLICY §AR-HEAD-MASTER-AUTHORITATIVE (org master is authoritative, manager is never a fallback).
- **Regression risk:** medium — the org-master head change cascades through existing `trg_cascade_bu_head_change` / `trg_cascade_department_head_change` triggers (pre-approval rows only). Mitigated by doing the master edit first, then reconciling residuals, then verifying zero orphans remain.
- **Rollback:** every changed row is captured in `annual_review_orphan_repair_2026_07` with old/new values, so a single UPDATE ... FROM restores prior state.

## Plan

**1. Org-master succession (root-cause fix)**
Point `business_units.head_user_id` for Corporate Affairs and EHS, and `departments.head_user_id` for the 4 Corporate Affairs / Corporate Communication departments, from Dinesh (101969) to Amit Kumar Sharma (102050). Verify the existing cascade triggers fire.
*Verification:* no active BU or department has an inactive head.

**2. Detection SSOT**
Add `public.get_orphaned_annual_reviews(p_cycle_id uuid default null)` (SECURITY DEFINER, admin/HR-PMS gated) returning, per pending instance: employee, stage, mapped reviewer, and `orphan_reason ∈ { inactive_reviewer, no_reviewer_mapped, inactive_org_head }`, plus a suggested successor resolved from current org master. TS mirror in `src/lib/annualReview/orphanReview.ts` with unit tests, so UI and SQL never drift.

**3. Admin "Orphaned Reviews" console**
New tab in `AnnualReviewAdmin.tsx` (`OrphanedReviewsTab.tsx`):
- Server-side paginated table (25/page): Employee, Code, Stage, Blocking reviewer, Reason, Suggested successor.
- Filters: cycle, stage, reason. Multi-select rows.
- **Bulk Reassign** action → picks a replacement reviewer (default = suggested), calls `admin_reassign_orphaned_reviewers` RPC, writes to `annual_review_orphan_repair_2026_07` and `annual_review_access_audit`.
- Empty state "No orphaned reviews" and a count badge on the tab.
- Destructive confirm via `ConfirmDestructiveDialog`.

**4. Preventive guard**
Trigger on `profiles.is_active → false`: if the user is a mapped reviewer on any non-terminal instance or an org-master head, raise a warning row into the orphan feed (does not block deactivation) so the console surfaces it same-day.

**5. Repair the 26 cases**
- 14 inactive-reviewer instances: repoint `bu_head_id` / `dept_head_id` to 102050, keep status and existing responses intact.
- 12 `pending_self` instances: re-resolve `enabled_stages` and reviewer ids from current org master via the existing hierarchy resolver; where a stage has no head, drop it per §AR-HEAD-MASTER-AUTHORITATIVE.
*Verification:* re-run the detection RPC → 0 rows.

**6. Docs, policy, tests**
- `POLICY.md` — new §AR-ORPHAN-REVIEWER-SUCCESSION.
- `DOCUMENTATION.md` — v2.66.173 + ADR-173.
- Unit tests for the orphan classifier (all 3 reasons, active-reviewer negative case, terminal-stage exclusion) and mock data.
- Project memory `mem/features/annual-review/orphan-reviewer-succession.md`.

## Technical notes

- Detection must exclude `completed` / `excluded` and stages already dropped from `enabled_stages`.
- Reassignment reuses the ADR-169 stage-response-transfer helper so any partially-entered response by the outgoing reviewer moves cleanly.
- Console reads go through the SECURITY DEFINER RPC (RLS on `annual_review_instances` would otherwise hide rows from HR-PMS).
