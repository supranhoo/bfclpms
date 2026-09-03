# Auditor cannot reopen a KRA after submitting on iPad — RCA, 5 Whys, CAPA, Fix Plan

## Assumptions
- "KRA" here means a KPI row on the Audit Review screen (Audit Scorecard), and "submitting" means the auditor forwarded/approved it.
- Device: iPad Safari, ~834 x 1112 CSS px (matches the reporter's form factor and the current preview viewport).

## Diagnosis status (honest)
The exact failure has **not** been reproduced yet. Two concrete, code-backed candidates were found; step 1 of the plan confirms which one before any fix ships.

### Candidate A — the reopen control becomes a tiny icon-only button (confirmed in code)
In `src/components/review/KpiDetailsTable.tsx` the action cell renders a full "Review"/"Continue" button while the KPI sits at the audit stage. Once the auditor submits, the KPI status advances to `management_review`, so the row switches to a "Forwarded" badge plus a ghost, icon-only eye button (lines 296-307). Same shape in `MobileKpiCard.tsx`. On a touch device that control is well under the 44px tap target, sits at the far right of a horizontally scrolling table, and reads as decoration rather than "open" — matching "unable to open it again".

### Candidate B — post-submit list/filter behaviour
`AuditScorecard.tsx` filters the list by `statusFilter` driven by the progress tracker. If a status chip is active when the auditor submits, the just-submitted row leaves the current filter and disappears from the visible list, so there is nothing to tap.

Both can be true at once. A third, weaker possibility (overlay/scroll lock left behind by the Sheet on iOS Safari after submit) is checked in step 1 and only fixed if reproduced.

## 5 Whys
1. Why can the auditor not open the KRA again? — After submission the row no longer offers an obvious "open" action.
2. Why not? — Post-audit rows drop to a "Forwarded" badge with a ghost icon-only eye button, and may be filtered out entirely.
3. Why was that acceptable? — The read-only view path was designed on desktop, where hover, cursor affordance and a wide table make the eye icon discoverable.
4. Why did desktop-only thinking survive? — The tablet breakpoint (>=768px) takes the desktop table path, so iPad was never exercised as a touch surface.
5. Why is there no guard? — No touch-target or post-submit "reopen" regression test exists for reviewer scorecards.

Root cause: the post-submit read-only affordance is desktop-shaped (icon-only, hover-discoverable, inside a horizontally scrolling table) and the tablet breakpoint routes iPad down that path; a status filter can additionally hide the row.

## Plan to fix

### Step 1 — Reproduce and confirm (before code changes)
Drive the Audit Review screen at 834x1112 with a touch-enabled context: open a KPI at audit stage, submit, then attempt to reopen. Capture whether (a) the row is still listed, (b) what control is offered, (c) whether taps register at all after the sheet closes. Verification: a screenshot plus the observed DOM state for the submitted row.

### Step 2 — Make the reopen action explicit (Candidate A)
In `KpiDetailsTable.tsx` and `MobileKpiCard.tsx`, replace the icon-only ghost eye for completed/forwarded reviewer states with a labelled "View" button (icon + text), sized to a >=44px touch target on coarse pointers. Applies to Forwarded, Reviewed, Draft (Mgmt), Completed and N/A states — presentation only, no change to who may act.

### Step 3 — Keep the just-submitted row visible (Candidate B)
In `AuditScorecard.tsx`, after a successful submit, clear the active `statusFilter` (or move the selection to the status the KPI just entered) and show a toast that names where the KPI went. No change to the underlying query or permissions.

### Step 4 — Only if step 1 shows stuck taps
Add the standard Radix close-cleanup guard on the audit review Sheet (release any lingering scroll/pointer lock on close) rather than a blanket global workaround.

## UI changes
- Audit Review KPI table (desktop/tablet): the small eye icon on completed rows becomes a labelled "View" button with a larger touch area. Position unchanged, at the right of the action cell.
- Mobile KPI card: same substitution in the card footer.
- After submitting, the list no longer silently hides the submitted KPI; a toast states the new stage.
- No layout, column, or navigation restructuring.

## Tests
- Unit: reviewer action-cell renders a labelled, touch-sized View control for `management_review` / `approved` in `audit` view.
- Unit: submitting with an active status filter clears the filter so the row stays visible.
- Playwright at 834x1112 with touch: submit then reopen the same KPI read-only.

## Risk and impact
- Data: none — presentation and local UI state only.
- Workflow/permissions: none — no change to `canReviewKpi`, RLS, or write paths.
- Regression risk: low; confined to the action cell renderer and one filter reset. Desktop layout must be re-checked for the wider button.
- Scalability: no new queries.
- Rollback: revert the two component files plus the filter reset; no schema or RPC dependency.

## Documentation and policy
- ADR-355: post-submit reopen affordance on touch devices, plus the touch-target rule for reviewer action cells.
- DOCUMENTATION.md version-history entry; POLICY.md note that reviewer read-only reopen must be a labelled control, not icon-only; roadmap.md entry.
