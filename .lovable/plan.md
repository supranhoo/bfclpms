

# Fix: Guarantee "Open in App" Button for @Mention Notifications

## Diagnosis

The navigation path computation logic is technically correct. The debug `console.log` added in the last fix never appeared in the console, indicating the latest code may not have been fully applied in the running app. However, the deeper problem is architectural: the "Open in App" button depends on a chain of path computation that can silently produce `null` due to missing metadata, timing issues, or edge cases.

## Solution: Add a Dedicated, Unconditional Button

Instead of relying solely on `effectiveNavigationPath`, add a **separate rendering branch** specifically for `observation_mention` notifications. This button will always render when `item.notificationType === 'observation_mention'`, regardless of what the path computation returns.

### File: `src/components/inbox/InboxDetailSheet.tsx`

**Change 1**: Add a dedicated "View Observation" button block that renders unconditionally for `observation_mention` notifications, right before the existing navigation button. It constructs its URL inline from `item.kpiId` and `item.metadata`, with no dependency on `getNotificationNavigationPath`.

```text
Rendering logic (simplified):

// Existing generic navigation button (unchanged)
{effectiveNavigationPath && !isMentionNotification && (
  <Button ...>Open in App</Button>
)}

// NEW: Dedicated mention button (always shows for observation_mention)
{item.notificationType === 'observation_mention' && (
  <Button onClick={() => {
    const meta = item.metadata || {};
    const kpi = item.kpiId || meta.kpi_id;
    const emp = meta.employee_id;
    const path = kpi && emp
      ? `/dashboard?mentioned_kpi=${kpi}&mentioned_employee=${emp}`
      : kpi ? `/dashboard?mentioned_kpi=${kpi}` : '/dashboard';
    onNavigate?.(path);
    onOpenChange(false);
  }}>
    Open in App
  </Button>
)}
```

This ensures:
- The button **always** appears for `observation_mention` notifications
- No dependency on `getNotificationNavigationPath` or `effectiveNavigationPath`
- The URL is constructed inline from the item's own data
- The existing button still works for all other notification types

**Change 2**: Remove the temporary debug `console.log` (no longer needed).

## Files to Modify

| File | Change |
|------|--------|
| `src/components/inbox/InboxDetailSheet.tsx` | Add unconditional mention button, remove debug log |

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|------------|
| Duplicate buttons | Low | Hide generic button when mention button is shown |
| Regression | None | Other notification types unaffected |

