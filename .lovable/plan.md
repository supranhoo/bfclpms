## Goal
Make the Bulk Review Dashboard reachable from the screens reviewers actually live on — not just the sidebar entry. The flag-gated route already exists at `/review/bulk-scoring`; we just expose a relevant, contextual launcher.

## Risk & Impact
- **Data**: None. Pure navigation UI.
- **Workflow**: None. Same RBAC + same feature flag (`feature_bulk_review_dashboard`) gates visibility — admins and reviewer roles only.
- **UI**: Adds one button to the Team Reviews / HR PMS / Audit / Management dashboard headers.
- **Regression risk**: Low — additive render only when flag is ON and view is a reviewer view.
- **Mitigation**: Re-use `useBulkReviewFlag()` hook (already cached 5 min); hide on `self`, `pending_self_review`, `pending_skip_review` views.

## Where to add the button
Primary placement — **`src/components/review/EmployeeSelectorGrid.tsx` header bar** (next to the existing filters/title row of Team Reviews, HR PMS Review, Audit Panel, Management Review). This is the most relevant surface because:
- It's where reviewers already triage the same KPI set one-employee-at-a-time.
- The bulk view is a power-user shortcut for the exact same task → contextual continuity.
- One button covers all 5 reviewer roles via the existing view-mode switch.

Secondary (no code, already exists): the sidebar "Bulk Review (Beta)" entry stays as-is.

## Plan
1. In `EmployeeSelectorGrid.tsx` header (next to the gradient title block, before/after the period filter):
   - Render a compact `<Button variant="outline" size="sm">` labelled **"Bulk Review"** with the `Layers` icon and a `Beta` badge.
   - Navigate to `/review/bulk-scoring` via `react-router-dom`'s `useNavigate`.
   - Visible only when:
     - `useBulkReviewFlag().data === true`, AND
     - `viewMode` is one of `team | skip_level | hr_pms | audit | management` (skip self / pending-tile views).
   - Tooltip: "Open bulk scoring view for this stage".
2. No changes to routing, RPCs, hooks, or RLS.
3. No changes to `BulkReviewDashboard.tsx` itself.

## UI Changes
- **What**: New "Bulk Review" outline button + Beta badge in the reviewer dashboard header.
- **Where**: Top-right of the `HEADER_CONFIG` title row in `EmployeeSelectorGrid.tsx`.
- **Interaction**: Click → navigates to `/review/bulk-scoring`.
- **Responsive**: Icon-only on `< sm` breakpoint, full label on `≥ sm`.

## Out of Scope
- Pre-filling period/year/stage from the current dashboard (could be a follow-up).
- Any change to the bulk dashboard itself.
- New permissions or flags.

## Tests
- Manual: toggle flag OFF → button hidden everywhere; ON → button appears for all five reviewer views, hidden on self / pending views.
- Existing flag/RBAC tests cover the route guard.

## Files to edit
- `src/components/review/EmployeeSelectorGrid.tsx` (header row only — additive).
