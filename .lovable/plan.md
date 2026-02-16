

# Fix Notification Deep-Link Navigation

## Problem
Several notification types fail to navigate to the correct location when "Open in App" is clicked. The root cause is a combination of incorrect employee ID resolution, missing notification type handling, and the Dashboard's deep-link handler silently failing when KPIs haven't loaded yet.

## Issues Found

### Issue 1: Observation notifications navigate to wrong employee
- `observation_raised` is sent TO the employee about their own KPI
- But the navigation code uses `buildEmployeeDeepLink('team', kpiId)` with `fromUser.id` (the reviewer who raised the observation)
- This tries to open the reviewer's scorecard in team view, which fails
- **Fix**: Observation notifications sent to the employee should use `/dashboard?kpi=...` (self view). Only reviewer-targeted observation replies should use employee deep-link.

### Issue 2: `admin_status_change` sent to manager lacks employee context
- When admin changes a KPI status, the manager receives a notification with `metadata.employee_id` set
- But the navigation path is just `/dashboard?kpi=${kpiId}` — no `employee` param
- The manager can't open another employee's KPI without the employee param
- **Fix**: Check if `meta.employee_id` exists and build a team deep-link for manager-targeted notifications

### Issue 3: `admin_data_override` type is unhandled
- The `admin_data_override` notification type (from admin daily data override) is not in the switch statement
- Falls to `default: return null`, so no "Open in App" button appears
- **Fix**: Add `admin_data_override` alongside `admin_data_entry`

### Issue 4: Dashboard deep-link silently fails for unloaded/filtered KPIs
- The self-view deep-link handler (line 257) returns early if `periodFilteredKpis` is empty or the KPI isn't found
- This happens when the notification's KPI belongs to a different review period than what's currently selected
- **Fix**: When a KPI deep-link param is present, look up the KPI's review period and auto-select it before trying to match

### Issue 5: Snoozed notification items lack fromUser enrichment
- Snoozed items (line 246-260) don't populate `fromUser`, `kpiName`, or `kraName` from metadata/profile
- When unsnoozed and clicked, the "Open in App" button may be missing or navigate incorrectly
- **Fix**: Apply the same enrichment logic as regular notifications

### Issue 6: `query_raised` notification needs sender context for reviewer
- `query_raised` notifications include a `query_id` in metadata but no `employee_id`
- The navigation `/dashboard?kpi=...&panel=queryHistory` works for self-view but not when a reviewer/manager receives it
- **Fix**: Use `related_user_id` / `fromUser` to build proper employee deep-link for reviewer-targeted query notifications

## Changes

### 1. `src/lib/inboxUtils.ts` — Fix navigation path logic
- Add `admin_data_override` to the self-view notification types
- Split `observation_raised`/`observation_reply`/`observation_resolved` logic:
  - Use `meta.employee_id` (from client-created observations) when available
  - Fall back to looking at `item.kpiId` context instead of `fromUser.id`
- For `admin_status_change` sent to managers: detect `meta.employee_id` and use `buildEmployeeDeepLink`
- For `query_raised`: use employee context when available for reviewer deep-links
- Accept optional `currentUserId` parameter to distinguish self-targeted vs reviewer-targeted notifications

### 2. `src/components/inbox/InboxDetailSheet.tsx` — Pass currentUserId to navigation
- Pass `currentUserId` to `getNotificationNavigationPath` so it can determine if the notification is for the user's own KPI or another employee's

### 3. `src/pages/QueryInbox.tsx` — Fix snoozed item enrichment
- Apply the same `relatedProfileMap` enrichment to snoozed notification items
- Ensure `fromUser`, `kpiName`, `kraName` are populated

### 4. `src/pages/Dashboard.tsx` — Improve deep-link resilience
- When `kpi` param is present and no match in `periodFilteredKpis`, fetch the KPI's period info and auto-switch the period selector
- Add a brief retry/wait mechanism so the deep-link works even if data is still loading

### 5. `src/hooks/useKpiObservations.ts` — Add employee_id to observation metadata
- When creating observation notifications, include `employee_id` in metadata so the navigation path can be resolved correctly

### 6. `DOCUMENTATION.md` — Update notification navigation docs

## Technical Details

| File | Change |
|---|---|
| `src/lib/inboxUtils.ts` | Fix navigation for observations, admin_data_override, admin_status_change to manager, query_raised to reviewer; add currentUserId param |
| `src/components/inbox/InboxDetailSheet.tsx` | Pass currentUserId to getNotificationNavigationPath |
| `src/components/inbox/MobileInboxList.tsx` | Pass currentUserId to getNotificationNavigationPath |
| `src/pages/QueryInbox.tsx` | Enrich snoozed items with fromUser/kpiName/kraName |
| `src/pages/Dashboard.tsx` | Auto-switch period when deep-link KPI is in different period; retry on loading |
| `src/hooks/useKpiObservations.ts` | Add employee_id to observation notification metadata |
| `DOCUMENTATION.md` | Update notification deep-link documentation |

