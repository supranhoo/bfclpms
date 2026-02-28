

# Fix: Enable Mentioned Users to View KPIs from Notification Deep-Links

## Problem

When Shekhar receives an `observation_mention` notification and clicks "Open in App", the deep-link navigates to `/dashboard?view=team&employee=...&kpi=...`. However, the Dashboard's "team" view is only available to managers, auditors, and admins. An employee-role user like Shekhar cannot access this view, so nothing loads -- the KPI is invisible even though RLS grants them read access via `kpi_mention_access`.

Additionally, the notification message includes the full KPI description (formula, scoring logic, etc.) making it unnecessarily long.

## Solution

### 1. Add a "mentioned" navigation path in `inboxUtils.ts`

For `observation_mention` notifications where the current user is NOT the KPI owner and NOT a manager, generate a deep-link using a new `mentioned_kpi` parameter instead of the `team` view:

```
/dashboard?mentioned_kpi=<kpi_id>&mentioned_employee=<employee_id>
```

This avoids relying on the `team` view which requires manager privileges.

### 2. Handle `mentioned_kpi` param in `Dashboard.tsx`

Add a new `useEffect` branch in the Dashboard's URL-parameter initialization to detect `mentioned_kpi`. When found:

- Fetch the KPI record directly (RLS allows it via `kpi_mention_access`)
- Fetch the KPI owner's basic profile for display context
- Open the KPI in a read-only detail panel (reuse the existing `KpiReviewPanel` or `KpiTrackerModal` in read-only mode)
- This keeps the user in their own "self" view but overlays the mentioned KPI details

### 3. Create a lightweight `MentionedKpiSheet` component

A new sheet/dialog component (`src/components/review/MentionedKpiSheet.tsx`) that:

- Fetches and displays the specific KPI details (name, target, achieved, score)
- Shows the KPI owner's name and designation for context
- Displays observations on this KPI (filtered to `visibility = 'public'`)
- Shows the observation reply thread
- Is entirely read-only -- no edit capabilities
- Has a clear "Read-Only Access via @Mention" badge

### 4. Trim notification message length

Update the notification creation in `useKpiObservations.ts` to use only `kpiData?.kpi_name` without appending the full description. The current message includes everything after the KPI name (Description, Formula, Scoring Logic) which creates a wall of text in notifications.

Change the message from:
```
mentioned you in observation "title" on <full_kpi_name_with_description>
```
To:
```
mentioned you in observation "title" on <short_kpi_name>
```

Where `short_kpi_name` truncates at the first line break or colon separator.

## Technical Details

### Files to Create

| File | Description |
|------|-------------|
| `src/components/review/MentionedKpiSheet.tsx` | Read-only KPI detail sheet for mentioned users |

### Files to Modify

| File | Change |
|------|--------|
| `src/lib/inboxUtils.ts` | Update `observation_mention` case to use `mentioned_kpi` param when user is not the KPI owner's manager |
| `src/pages/Dashboard.tsx` | Add `mentioned_kpi` URL param handler to open `MentionedKpiSheet` |
| `src/hooks/useKpiObservations.ts` | Truncate KPI name in notification message to avoid showing full description |
| `src/hooks/useObservationReplies.ts` | Same truncation fix for reply mention notifications |
| `DOCUMENTATION.md` | Document the mentioned-KPI deep-link flow |

### Navigation Flow

```text
Notification Detail Sheet
  -> "Open in App" button
  -> /dashboard?mentioned_kpi=<kpi_id>&mentioned_employee=<emp_id>
  -> Dashboard detects mentioned_kpi param
  -> Opens MentionedKpiSheet (read-only overlay)
  -> Shows KPI info + public observations + reply threads
```

### MentionedKpiSheet Data Fetching

The sheet will fetch:
1. KPI record from `kpis` table (accessible via `kpi_mention_access` RLS)
2. KPI owner profile from `profiles` table
3. Public observations from `kpi_observations` (accessible via RLS, filtered to `visibility = 'public'`)
4. Observation replies (accessible via RLS)

All queries leverage the existing `kpi_mention_access` RLS policies already in place.

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|------------|
| Data exposure | Low | Only public observations shown; existing RLS policies enforce access |
| Regression | None | New param handler is additive; existing deep-links unaffected |
| UI consistency | Low | Sheet reuses existing design patterns (similar to KpiReviewPanel) |

