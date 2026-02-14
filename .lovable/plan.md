

# RCA and CAPA: Notification Detail Sheet Lacks Details and Navigation Fails

## Root Cause Analysis (RCA)

### Problem 1: Detail sheet shows sparse information
When a notification is clicked, the detail popup lacks key context -- no KPI name, no KRA name, no "From" user. This is because the `notificationItems` mapping in `QueryInbox.tsx` (lines 185-200) only maps basic fields (`id`, `title`, `message`, `kpiId`, etc.) but leaves `kpiName`, `kraName`, and `fromUser` undefined. The notification `metadata` JSON already contains `employee_name`, `kra_name`, and other useful fields, but they are never extracted.

### Problem 2: "Open in App" navigates to plain Dashboard, not to the exact KPI
The `getNotificationNavigationPath()` correctly builds URLs like `/dashboard?kpi={kpiId}`. However, the Dashboard's deep-link handler (line 237) searches for that KPI in `periodFilteredKpis` -- the **current user's own KPIs**. Most notifications are about **another employee's** KPI (e.g., a manager receiving a "Self Review Submitted" notification). Since the KPI doesn't belong to the current user, the lookup fails silently, and the user lands on the plain Dashboard with nothing opened.

### Summary of Root Causes

| Issue | Root Cause |
|---|---|
| Missing details in popup | `notificationItems` doesn't extract `kpiName`, `kraName`, `fromUser` from `metadata` or `related_user_id` |
| Navigation goes to plain Dashboard | Dashboard deep-link only searches the user's own KPIs; it has no mechanism to auto-select an employee and open their KPI in the reviewer view |

---

## Corrective and Preventive Action (CAPA)

### Fix 1: Enrich notification items with metadata

**File: `src/pages/QueryInbox.tsx`** (lines 185-200)

Update the `notificationItems` mapping to extract `kpiName` and `kraName` from the notification's `metadata` JSON. Also look up `related_user_id` from the already-fetched profiles to populate the `fromUser` field.

Changes:
- Fetch profiles for all `related_user_id` values from notifications (batch query)
- Map `metadata.kra_name` to `kraName`
- Extract the KPI name from the notification `title` or `metadata`
- Populate `fromUser` using the `related_user_id` profile lookup

### Fix 2: Add employee deep-link to navigation paths

**File: `src/lib/inboxUtils.ts`**

Update `getNotificationNavigationPath` to include an `employee` query parameter using the notification's `metadata` for employee-related notification types:

```text
/dashboard?view=team&employee={related_user_id}&kpi={kpiId}
```

This requires passing `metadata` and building the URL with the employee context. The function signature will accept the full `InboxItem` (which it already does).

### Fix 3: Dashboard handles `employee` query parameter

**File: `src/pages/Dashboard.tsx`**

Add a new `useEffect` that reads `employee` from URL params. When present:
1. Switch to the appropriate view mode (from `view` param, defaulting to `team`)
2. Fetch the employee's profile
3. Call `setSelectedEmployee()` with the profile
4. Set `autoOpenKpiId` from the `kpi` param

This leverages the existing `UnifiedScorecard` component which already accepts `autoOpenKpiId` and will auto-open the correct KPI.

### Files to Modify

| File | Change |
|---|---|
| `src/pages/QueryInbox.tsx` | Enrich `notificationItems` mapping with `kpiName`, `kraName`, `fromUser` from metadata and profile lookups |
| `src/lib/inboxUtils.ts` | Update `getNotificationNavigationPath` to include `employee` param for reviewer-targeted notifications |
| `src/pages/Dashboard.tsx` | Add `useEffect` to handle `employee` query param for auto-selecting employee and opening their KPI |
| `DOCUMENTATION.md` | Document the enhanced deep-link format and enriched notification detail sheet |

### Technical Detail

Navigation URL format will change from:
```text
/dashboard?kpi={kpiId}
```
to:
```text
/dashboard?view=team&employee={relatedUserId}&kpi={kpiId}
```

The Dashboard will handle this by:
1. Reading `employee` param
2. Fetching that employee's profile from the `profiles` table
3. Calling `handleSelectEmployee(profile, kpiId)` which triggers `UnifiedScorecard` with `autoOpenKpiId`

For the user's own notifications (e.g., `kpi_approved`, `manager_rejected`), the existing self-view deep-link will continue to work since the KPI belongs to the current user.

### Risk

Low -- enrichment uses existing metadata fields. Dashboard changes add a new entry point to existing employee selection logic. No changes to data or workflow.

