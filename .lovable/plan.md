

## Fix: Sent-Back Records Not Appearing in Timeline History

### Root Cause

The audit log record **does exist** in the database (`AUDITOR_SENT_BACK_TO_EMPLOYEE` at `2026-03-26 15:00:48`). The issue is **stale query cache** — the send-back mutation in `AuditScorecard.tsx` (and other scorecards) does NOT invalidate the timeline/audit-log query keys after a successful send-back.

**Specific gaps:**

| Scorecard | Invalidates on send-back | Missing invalidations |
|---|---|---|
| `AuditScorecard.tsx` | `['kpis']`, `['review-submissions']` | `['kpi-timeline']`, `['kpi-journey-audit-logs']` |
| `ManagementScorecard.tsx` | `['kpis']`, `['review-submissions']` | `['kpi-timeline']`, `['kpi-journey-audit-logs']` |
| `UnifiedScorecard.tsx` | `['kpis']`, `['review-submissions']` | `['kpi-timeline']`, `['kpi-journey-audit-logs']` |

Additionally, `KpiJourneySection.tsx` uses `staleTime: 5 * 60 * 1000` (5 min), which prevents refetch even after invalidation from other flows.

### Fix

1. **`src/components/review/AuditScorecard.tsx`** — Add `queryClient.invalidateQueries({ queryKey: ['kpi-timeline'] })` and `queryClient.invalidateQueries({ queryKey: ['kpi-journey-audit-logs'] })` to the send-back mutation's `onSuccess`

2. **`src/components/review/ManagementScorecard.tsx`** — Same invalidation additions in the send-back `onSuccess`

3. **`src/components/review/UnifiedScorecard.tsx`** — Same invalidation additions in the send-back `onSuccess`

4. **`src/components/review/KpiJourneySection.tsx`** — Reduce `staleTime` from `5 * 60 * 1000` to `30 * 1000` (30 seconds) for audit logs query, so timeline data stays reasonably fresh

5. **`DOCUMENTATION.md`** / **`POLICY.md`** — Version history update

### Risk Assessment
- **Data Impact**: None — read-only cache invalidation
- **Workflow Impact**: None — additive fix
- **Regression Risk**: Zero — only adding cache invalidation calls and reducing staleTime

