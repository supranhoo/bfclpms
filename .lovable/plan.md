

## Audit Result: Query Feature Connectivity

### Status: Nearly Complete — 1 Gap Found

All 5 fixes from the previous plan are properly wired:

| # | Fix | Status |
|---|-----|--------|
| 1 | RLS policy for raiser to update queries | Done — both `raised_by` and `raised_to` UPDATE policies exist |
| 2 | Evidence upload on Raise Query dialogs | Done — both `UnifiedScorecard` and `EmployeeScorecard` include `EvidenceUpload` and pass `evidence_url` |
| 3 | Notifications on respond/accept | Done — `useRespondToQuery` and `useAcceptQueryResponse` both insert notification records |
| 4 | All reviewer roles can raise queries | Done — line 1648 checks `['manager', 'auditor', 'skip_level', 'hr_pms', 'management']` |
| 5 | Inline respond from SelfReviewSheet | Done — fetches open queries, shows respond form with evidence upload |

### Remaining Gap

**`useRaiseQuery` does NOT notify the recipient.** When a manager raises a query, the employee (`raised_to`) receives no notification. The hook only creates an audit log and invalidates query caches — but never inserts into the `notifications` table.

`useRespondToQuery` and `useAcceptQueryResponse` both correctly insert notifications. Only the initial "raise" step is missing.

### Fix

Add a notification insert in `useRaiseQuery` (`src/hooks/useKpis.ts`, inside the `mutationFn` after the audit log insert, or in `onSuccess`):

- Fetch the KPI name and raiser profile
- Insert a notification for `raised_to` with type `query_raised`, title "New Query Raised", and the KPI name + raiser name in the message
- Include `kpi_id` and `related_user_id` for deep-linking

### File Changed
- `src/hooks/useKpis.ts` — `useRaiseQuery` mutation: add notification insert after audit log

