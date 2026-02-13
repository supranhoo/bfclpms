

# Merge "My KPIs" into "My Dashboard" — Unified Self-Service View

## What Changes for the User

Instead of two separate tabs in the sidebar ("Dashboard" and "My KPIs"), there will be **one unified "My Dashboard"** page. When an employee clicks on a KPI — whether to submit a self-review or view details — the same rich sheet opens right there on the Dashboard. No more redirecting to a separate page.

## Current State

| Feature | Dashboard | My KPIs |
|---|---|---|
| KPI list/table | Yes (read-only) | Yes (with submit actions) |
| Performance charts | Yes | No |
| Workflow progress tracker | Yes | No |
| Profile card | Yes | No |
| Cumulative/YTD mode | Yes | No |
| View mode toggle (team/audit) | Yes | No |
| Self-review submission form | No (redirects to My KPIs) | Yes |
| Sub-period entry (daily/weekly) | No | Yes |
| Evidence upload | No | Yes |
| NA marking | No | Yes |
| Resubmission flow | No | Yes |
| Monthly aggregation submit | No | Yes |
| Deep-link from notifications | No (goes to My KPIs) | Yes |

## Plan

### Step 1: Move Self-Review Sheet Logic into Dashboard

Extract the self-review submission sheet from `MyKpis.tsx` (~600 lines of form state, handlers, and sheet UI) into a new reusable component:

**New file: `src/components/review/SelfReviewSheet.tsx`**
- All form state (achieved value, remarks, evidence, NA, sub-period selection)
- Score calculation logic
- Submit handlers (regular, sub-period, monthly aggregation, resubmission)
- The full Sheet UI with all form fields
- Props: `kpi`, `submissionMap`, `orgKpiValues`, `onClose`, period info

### Step 2: Integrate into Dashboard

Update `Dashboard.tsx` to:
- Import and render `SelfReviewSheet` instead of the read-only `KpiReviewPanel`
- Change the "Review" button (currently navigates to `/my-kpis`) to open the sheet directly
- Add the sub-period submissions hook for daily/weekly KPIs
- Fetch `allSubmissions` for historical data (already partially done)
- Handle deep-link query params (`?kpi=...`) that currently only work on My KPIs

### Step 3: Update KPI Table Actions

In the Dashboard's KPI table:
- Replace the current split behavior (Review button navigates away for `kra_set`, Eye button opens read-only sheet) with a single action that always opens the `SelfReviewSheet`
- The sheet itself handles read-only vs. editable based on KPI status

### Step 4: Update Navigation

- Remove "My KPIs" from the sidebar menu items
- Rename "Dashboard" to "My Dashboard" if desired
- Redirect `/my-kpis` route to `/dashboard` for backward compatibility (deep links, notifications)
- Update notification navigation paths in `inboxUtils.ts` to point to `/dashboard?kpi={kpiId}`

### Step 5: Clean Up

- Keep `MyKpis.tsx` temporarily as a redirect, then remove later
- Update all references that navigate to `/my-kpis`

## Technical Details

### Files to create:
- `src/components/review/SelfReviewSheet.tsx` — Extracted self-review form component (~400 lines)

### Files to modify:
- `src/pages/Dashboard.tsx` — Integrate SelfReviewSheet, add submission hooks, handle deep-links
- `src/components/layout/AppSidebar.tsx` — Remove "My KPIs" menu item, rename "Dashboard"
- `src/lib/inboxUtils.ts` — Update notification navigation paths from `/my-kpis` to `/dashboard`
- `src/pages/MyKpis.tsx` — Convert to redirect component
- `src/App.tsx` — Update routing
- `DOCUMENTATION.md` — Update architecture docs

### Risks and Mitigations
- **Dashboard.tsx complexity**: Adding ~600 lines of form logic to an already 714-line file would make it unwieldy. The extraction into `SelfReviewSheet.tsx` keeps Dashboard clean.
- **Deep-links**: All existing notification links (`/my-kpis?kpi=...`) will be caught by the redirect and forwarded to Dashboard.
- **Sub-period hooks**: Dashboard currently doesn't fetch sub-period submissions. Adding the `useSubPeriodSubmissionsByKpis` hook is straightforward since the KPI IDs are already available.

### What stays the same
- All reviewer views (Team, Audit, Management) remain unchanged
- The submission logic itself is unchanged, just relocated
- Charts, workflow tracker, profile card all stay as-is

