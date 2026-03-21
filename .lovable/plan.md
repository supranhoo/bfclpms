

## Persist Dashboard View Mode Across Page Refresh

### Problem
When a user is on any dashboard tab (e.g., Team Reviews, HR PMS, Audit) and refreshes the page, the URL is just `/dashboard` with no `view` parameter, so `viewMode` resets to `'self'`.

### Solution
Sync the `viewMode` state to the URL query parameter `?view=...`. When the user switches tabs, update the URL. On page load/refresh, read the `view` param and restore the tab.

### Implementation — `src/pages/Dashboard.tsx`

**1. When `viewMode` changes, write it to the URL:**
Add a `useEffect` that sets `?view=<mode>` in the search params whenever `viewMode` changes. For `'self'`, remove the param to keep the URL clean.

```typescript
useEffect(() => {
  setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    if (viewMode === 'self') {
      next.delete('view');
    } else {
      next.set('view', viewMode);
    }
    return next;
  }, { replace: true });
}, [viewMode]);
```

**2. Update `handleModeChange`:**
No change needed — it already calls `setViewMode`, which will trigger the effect above.

**3. Existing URL-read logic (line 72-81):**
Already reads `?view=` and sets mode — this handles the refresh case. No change needed.

### Adverse Impact Analysis
- **None on deep-links** — existing `?kpi=`, `?employee=`, `?panel=` params coexist with `?view=` since we use `URLSearchParams` (additive).
- **None on bookmarking** — URLs become bookmarkable per tab, which is a benefit.
- **Minor**: if a user shares a `/dashboard?view=hr_pms` link with someone who doesn't have the `hr_pms` role, the guard at line 77 (`availableModes.includes(mappedMode)`) already handles this — it simply won't apply the mode and falls back to `'self'`.
- **Browser back/forward**: Using `replace: true` avoids polluting browser history with every tab switch, so back button behavior is unaffected.

### Single file change, no database changes.

