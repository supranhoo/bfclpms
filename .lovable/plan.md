
# Navigate Query Notifications to KPI Details + Query History

## Problem
Query-related notifications (`query_raised`, `query_resolved`, `query_responded`, `query_response_submitted`) currently navigate to the Query Inbox page (`/queries?tab=received`). The user expects them to open the specific KPI's detail view with the Query History dialog visible.

## Approach

### 1. Update notification navigation paths (`src/lib/inboxUtils.ts`)
Change query notification routes to point to `/my-kpis?kpi={kpiId}&panel=queryHistory` instead of `/queries?tab=...`:

| Notification Type | Current Route | New Route |
|---|---|---|
| `query_raised` | `/queries?tab=received` | `/my-kpis?kpi={kpiId}&panel=queryHistory` |
| `query_resolved` | `/queries?tab=sent` | `/my-kpis?kpi={kpiId}&panel=queryHistory` |
| `query_responded` | `/queries?tab=sent` | `/my-kpis?kpi={kpiId}&panel=queryHistory` |
| `query_response_submitted` | `/queries?tab=sent` | `/my-kpis?kpi={kpiId}&panel=queryHistory` |
| `query_resolved_fyi` | `/queries?tab=team` | `/my-kpis?kpi={kpiId}&panel=queryHistory` |

### 2. Add URL parameter handling in My KPIs page (`src/pages/MyKpis.tsx`)
- Read `kpi` and `panel` search params from the URL using `useSearchParams`
- When `kpi` param is present, auto-open the KPI review panel for that KPI
- When `panel=queryHistory` is also present, auto-open the Query History dialog after the panel opens

### 3. Wire auto-open into the KPI review panel flow
- The My KPIs page already has a sheet-based KPI detail view. Add an effect that:
  1. Finds the KPI matching the URL param
  2. Opens the detail sheet for it
  3. If `panel=queryHistory`, sets the Query History dialog open state to `true`
- Clean up URL params after opening so browser back/forward doesn't re-trigger

### 4. Update `DOCUMENTATION.md`
Document the new deep-link behavior for query notifications.

## Technical Details

**Files to modify:**
- `src/lib/inboxUtils.ts` -- Change 5 notification type routes in `getNotificationNavigationPath()`
- `src/pages/MyKpis.tsx` -- Add `useSearchParams` import, read `kpi` and `panel` params, add auto-open effect for KPI sheet and Query History dialog
- `DOCUMENTATION.md` -- Update notification navigation mapping docs
