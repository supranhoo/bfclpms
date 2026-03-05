
# BUG-006 and BUG-009 — FIXED ✅

## BUG-006: QueryInbox unread count — DONE
Replaced local `useMemo` filter with `useUnreadNotificationCount()` hook for accurate server-side count.

## BUG-009: Dashboard eager submission fetch — DONE
Made `useReviewSubmissions` conditional on `selectedKpiReview`, so it only fetches when a KPI review panel is open.
