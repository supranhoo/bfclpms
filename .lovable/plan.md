

# Fix: Employee Self-Review Submission Not Working

## Problem

The user "Dummy" (employee role) cannot submit self-reviews for January KPIs. The root cause is a broken workflow:

1. The `/my-kpis` route (which has the full submission form in `MyKpis.tsx`) **redirects to `/dashboard`**
2. The Dashboard page opens a `KpiReviewPanel` when clicking "Review" -- but this component is **read-only** (it only displays KPI details and review journey, with no input fields for achieved value, score, or remarks)
3. Result: employees see their KPIs and can click "Review", but hit a dead end with no way to submit

The KPIs for "Dummy" exist in the database for January 2026 (5 KPIs, all in `kra_set` status), but there are zero `review_submissions` records because there is no way to create them.

## Solution

Restore the My KPIs page as the primary self-review submission interface for employees, keeping the Dashboard as a read-only overview.

### Changes

**1. Restore `/my-kpis` route in `src/App.tsx`**
- Remove the redirect `<Navigate to="/dashboard" replace />`
- Add `MyKpis` as a lazy-loaded page component
- Route `/my-kpis` to render the `MyKpis` component (available to all authenticated users)

**2. Add "My KPIs" to the sidebar in `src/components/layout/AppSidebar.tsx`**
- Add a "My KPIs" menu item with the `Target` icon at path `/my-kpis`
- Available to roles: `employee`, `manager`, `admin`, `auditor`, `management` (everyone can submit their own reviews)
- Position it right after "Dashboard" in the main section

**3. Update Dashboard "Review" button behavior in `src/pages/Dashboard.tsx`**
- For KPIs in `kra_set` status, change the "Review" button to navigate to `/my-kpis` (with the correct period pre-selected) instead of opening the read-only panel
- Keep the "View" (Eye) button for non-kra_set KPIs to open the read-only panel as it does now

**4. Update `DOCUMENTATION.md`**
- Document the restored My KPIs route and its role in the self-review workflow

## Verification

After the fix, the employee "Dummy" will:
1. See "My KPIs" in the sidebar
2. Navigate to the My KPIs page
3. See their 5 January 2026 KPIs in `kra_set` status
4. Click "Review & Submit" to open the submission form with achieved value input, score calculation, remarks, and evidence upload
5. Submit successfully, transitioning the KPI to `self_review` status

