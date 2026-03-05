

# Fix BUG-006 and BUG-009

## BUG-006: QueryInbox unread count uses local array instead of server count

**Current**: Lines 120-123 count `notifications.filter(n => !n.is_read).length` from the first 20 paginated items.
**Fix**: Import and use the existing `useUnreadNotificationCount()` hook from `src/hooks/useNotifications.ts`, which does a `SELECT count(*)` server-side with `head: true`. Replace the local `useMemo` with the hook's return value.

**File**: `src/pages/QueryInbox.tsx`
- Remove lines 120-123 (the `useMemo` block)
- Add `import { useUnreadNotificationCount } from '@/hooks/useNotifications'`
- Add `const { data: unreadNotificationsCount = 0 } = useUnreadNotificationCount()`

No other changes needed — the variable name stays the same so all downstream references work.

---

## BUG-009: Dashboard fetches all submissions eagerly

**Current**: Line 192 calls `useReviewSubmissions(allKpiIds)` on mount, fetching every submission across all periods. This data is only used when a user opens `KpiReviewPanel` to see history.

**Fix**: Lazy-load the `allSubmissions` query by making it conditional — only fetch when a KPI review panel is open.

**File**: `src/pages/Dashboard.tsx`
- Change line 192 to pass an empty array when no KPI panel is open: `useReviewSubmissions(selectedKpiReview ? allKpiIds : [])`
- This means `allSubmissions` only fetches when a user clicks to open a KPI review panel, eliminating the redundant eager load

This is a safe change because `useReviewSubmissions` already handles empty arrays (returns `[]`), and `KpiReviewPanel` re-renders when `selectedKpiReview` changes, triggering the fetch.

---

## Risk Assessment
- **Data Impact**: None — read-only queries
- **Regression Risk**: Minimal — BUG-006 uses an existing tested hook; BUG-009 delays a query but doesn't remove it
- **Performance Gain**: BUG-009 eliminates potentially 1000+ row fetches on every dashboard load

