## Goal
Twinkle (200679) — and every HR-team member with `scope='all'` — must be able to **view Annual Review (Team) for all employees** and **submit the self-review on their behalf**, matching HR-PMS. No other rights (no approvals, no HR-final scoring, no admin actions).

## RCA recap
- Directory resolver already returns `scope = 'all'` for her (HR BU membership).
- Directory search + "assisted self-submission" already work while `overall_status = 'pending_self'`.
- Missing piece: RLS SELECT helper `can_access_annual_review_instance_for_assistance()` returns `false` for any status other than `pending_self`, so once an employee submits, the row disappears from her Team queue and detail page.
- Assisted self-submission itself is already only meaningful in `pending_self`, so no write policy needs to change.

## Change (read-only widening)

**Single migration** — replace `public.can_access_annual_review_instance_for_assistance(uuid)`:

- `scope = 'all'` → return `true` for **any** overall_status (drop the `pending_self` gate).
- `scope = 'bu'` → return `true` only when instance's employee BU equals user's BU (unchanged).
- All other branches unchanged.

Nothing else changes:
- `instances_stage_update` (write) — still requires user to be the assigned manager/skip/dept/bu/hr, or `admin`/`hr_pms`. Twinkle qualifies for none, so she still cannot approve.
- `annual_review_responses` RLS — unchanged; she still cannot enter manager/HR scores.
- `submit_self_review_proxy` RPC — unchanged; still gated to `pending_self` + directory scope, which she already passes.
- Frontend — no change needed; `useReviewQueue`, `useReviewInstance`, Team detail, directory search and Assisted Submission dialog all render whatever RLS returns.

## Tests
Extend `src/test/annualReview/directoryAccess.test.ts` (or add `assistanceVisibility.test.ts`) with cases:
- `scope='all'` + status `pending_manager` / `pending_hr` / `completed` → visible.
- `scope='bu'` in-BU any status → visible.
- `scope='bu'` out-of-BU → hidden.
- `can_access=false` → hidden.

## Docs
- `mem/features/annual-review/directory-access.md` — note HR-team read scope is stage-agnostic.
- `POLICY.md` §AR-DIRECTORY-ACCESS-MATRIX — update the matrix row for HR-Team.
- `docs/adr/ADR-107.md` — record decision + rollback (revert function to prior body).

## Risk & Impact
- **Data:** none — read-only.
- **Workflow:** unchanged — all write paths still gated by assignment or admin/hr_pms role.
- **UI/UX:** HR-BU users now see the full roster in Team queue across every stage; no visual redesign.
- **Regression risk:** low — one RLS helper touched.
- **Rollback:** single migration; revert restores the previous body.

Proceeding to write the migration when this plan is approved.
