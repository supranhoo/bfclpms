

# Fix: Missing "Open in App" Button for @Mention Notifications

## Problem

When Shekhar opens an `observation_mention` notification in the inbox detail sheet, there is no "Open in App" button — only a "Close" button. This means the user has no way to navigate to the KPI and view the observation.

## Root Cause

The `InboxDetailSheet` conditionally renders the "Open in App" button only when `getNotificationNavigationPath()` returns a non-null value. For `observation_mention` notifications, this function relies on `item.kpiId` and `item.metadata.employee_id` being populated. If either is missing or the logic falls through, the button disappears silently with no fallback.

## Solution

Add a dedicated fallback in `InboxDetailSheet` specifically for `observation_mention` notifications. If the standard `navigationPath` is null but the item has the necessary metadata (`kpi_id` in metadata or the item's `kpiId`, plus `employee_id` in metadata), construct the deep-link URL directly from the metadata. This ensures the button always appears for mention notifications.

### Changes

**1. `src/components/inbox/InboxDetailSheet.tsx`**

Add a fallback navigation path computation for `observation_mention` notifications:

- After computing `navigationPath`, if it is null and `item.notificationType === 'observation_mention'`, build the URL from `item.metadata.employee_id` and `item.kpiId` (or `item.metadata.kpi_id`).
- This guarantees the "Open in App" button always renders for mention notifications.

```text
Before:
  navigationPath = getNotificationNavigationPath(item, currentUserId)
  Button shows only if navigationPath is truthy

After:
  navigationPath = getNotificationNavigationPath(item, currentUserId)
  If null AND item is observation_mention:
    Build /dashboard?mentioned_kpi=...&mentioned_employee=... from metadata
  Button shows if finalPath is truthy
```

**2. `src/lib/inboxUtils.ts`** (defensive fix)

In the `observation_mention` case, add a broader fallback: if `obsEmployeeId` or `item.kpiId` is missing, try extracting values from `item.metadata` (which stores `employee_id`) and fall back to a generic `/dashboard` link rather than returning `null`.

### Technical Detail

The `InboxDetailSheet` change (approximately 5 lines):

```tsx
// After line 36
const navigationPath = getNotificationNavigationPath(item, currentUserId);

// Add fallback for @mention notifications
const effectiveNavigationPath = navigationPath || (() => {
  if (item.notificationType === 'observation_mention') {
    const meta = item.metadata || {};
    const kpi = item.kpiId || meta.kpi_id;
    const emp = meta.employee_id;
    if (kpi && emp) {
      return `/dashboard?mentioned_kpi=${kpi}&mentioned_employee=${emp}`;
    }
    if (kpi) {
      return `/dashboard?kpi=${kpi}`;
    }
  }
  return null;
})();
```

Then use `effectiveNavigationPath` in both the condition and the handler.

### Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|------------|
| Regression | None | Only adds a fallback; existing navigation paths remain unchanged |
| Data access | Low | Uses same `mentioned_kpi` param already handled by Dashboard |
| UI | None | Button appearance is additive only |

### Files to Modify

| File | Change |
|------|--------|
| `src/components/inbox/InboxDetailSheet.tsx` | Add fallback navigation path for `observation_mention` |
| `src/lib/inboxUtils.ts` | Defensive fallback in `observation_mention` case to avoid returning null |

