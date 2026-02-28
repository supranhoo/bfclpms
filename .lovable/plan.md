

# Fix: Persistent Missing "Open in App" Button for @Mention Notifications

## Investigation Summary

Thorough investigation of both the code and the actual database data reveals:
- The notification data is correct: `kpi_id` and `metadata.employee_id` are both populated
- The `getNotificationNavigationPath()` function should return a valid URL for `observation_mention`
- The `InboxDetailSheet` fallback logic is in place
- Yet the button still doesn't appear

## Root Cause Hypothesis

The most likely cause is a subtle rendering issue: the `effectiveNavigationPath` is computed as an IIFE (Immediately Invoked Function Expression) inside the component, but its return value might be evaluated as `null` in an edge case where the `navigationPath` variable itself is an empty string `""` (falsy but not null). Additionally, there may be a timing issue where the component renders before `currentUserId` is available.

## Solution: Make the Logic More Robust

### 1. Simplify `InboxDetailSheet.tsx` navigation logic

Replace the current IIFE fallback with a simpler, more explicit `useMemo`-based approach that:
- Always returns a valid path for `observation_mention` notifications
- Adds a `console.log` for debugging to confirm what values are in play
- Moves the "Open in App" button OUTSIDE the `!isQuery` guard for `observation_mention` type specifically, so it shows regardless

```text
Current logic:
  const navigationPath = getNotificationNavigationPath(item, currentUserId);
  const effectiveNavigationPath = navigationPath || IIFE();
  // Button: {!isQuery && effectiveNavigationPath && (...)}

New logic:
  const navigationPath = getNotificationNavigationPath(item, currentUserId);
  // Explicit fallback computation (no IIFE)
  let effectiveNavigationPath = navigationPath;
  if (!effectiveNavigationPath && item.notificationType === 'observation_mention') {
    const meta = (item.metadata || {}) as Record<string, any>;
    const kpi = item.kpiId || meta.kpi_id;
    const emp = meta.employee_id;
    if (kpi && emp) effectiveNavigationPath = `/dashboard?mentioned_kpi=${kpi}&mentioned_employee=${emp}`;
    else if (kpi) effectiveNavigationPath = `/dashboard?mentioned_kpi=${kpi}`;
    else effectiveNavigationPath = '/dashboard';
  }
  // Button: {!isQuery && effectiveNavigationPath && (...)}
```

### 2. Broaden the button visibility condition

Change the button rendering condition from `{!isQuery && effectiveNavigationPath && (...)}` to also show for ANY notification type that has an `effectiveNavigationPath`, removing potential edge-case exclusions.

### 3. Add temporary diagnostic logging

Add a `console.log` that outputs the key values (`navigationPath`, `effectiveNavigationPath`, `item.notificationType`, `item.kpiId`, `item.metadata`) when the detail sheet opens for an `observation_mention`. This will help confirm what's happening at runtime if the issue persists.

## Files to Modify

| File | Change |
|------|--------|
| `src/components/inbox/InboxDetailSheet.tsx` | Simplify fallback logic, add diagnostic log |

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|------------|
| Regression | None | Logic is equivalent but simpler |
| Debug noise | Low | Console log only fires for observation_mention |

