

## Fix: Query Feature — End-to-End Functionality Audit & Repairs

### Issues Found

| # | Bug | Impact | Root Cause |
|---|-----|--------|------------|
| 1 | **Accept Response fails silently** | Raiser (manager) cannot resolve a query after employee responds | RLS UPDATE policy only allows `raised_to` to update. The raiser (`raised_by`) calling `useAcceptQueryResponse` is blocked by RLS. |
| 2 | **No evidence upload on Raise Query** | Manager can't attach supporting documents when raising a query | Both `EmployeeScorecard` and `UnifiedScorecard` query dialogs only have a text field — no `EvidenceUpload` component, and `useRaiseQuery` doesn't pass `evidence_url`. |
| 3 | **No notification on query raise/respond** | Recipient doesn't know a query was raised or responded to unless they check the Inbox manually | `useRaiseQuery` and `useRespondToQuery` don't create notification records. |
| 4 | **Query Raise limited to managers** | Auditors, skip-level managers, HR PMS, and management can't raise queries despite viewing KPIs | `UnifiedScorecard` restricts Raise Query button to `viewLevel === 'manager'`. |
| 5 | **Employee has no in-dashboard respond path** | Employee must navigate to Inbox to respond; no respond action from their Dashboard/SelfReviewSheet | `SelfReviewSheet` shows query history but no inline respond capability for open queries. |

### Fix Plan

| # | Fix | Files Changed |
|---|-----|---------------|
| 1 | **Add RLS policy for raiser to update queries** | Database migration |
| 2 | **Add evidence upload to Raise Query dialogs** | `UnifiedScorecard.tsx`, `EmployeeScorecard.tsx`, `useKpis.ts` |
| 3 | **Create notifications on query actions** | `useKpis.ts` (raise), `useQueryWorkflow.ts` (respond, accept) |
| 4 | **Allow all reviewer roles to raise queries** | `UnifiedScorecard.tsx` |
| 5 | **Add respond-to-query in SelfReviewSheet** | `SelfReviewSheet.tsx` |

### Detail

**Fix 1 — RLS: Allow raiser to update their own queries**

Currently only `raised_to` can UPDATE. The raiser needs to set `status='resolved'` and `resolved_at` when accepting a response. Add a new policy:

```sql
CREATE POLICY "Users can update queries they raised"
ON public.kpi_queries
FOR UPDATE
TO authenticated
USING (raised_by = auth.uid());
```

**Fix 2 — Evidence upload on Raise Query**

Add `EvidenceUpload` component to both query dialogs. Update `useRaiseQuery` mutation to accept and save `evidence_url`. The `kpi_queries` table already has `evidence_url` and `evidence_urls` columns.

**Fix 3 — Notifications on query workflow actions**

After raising a query, insert a notification for the recipient (`raised_to`). After responding, notify the raiser (`raised_by`). After accepting, notify the responder. Uses existing `notifications` table with types `query_raised`, `query_responded`, `query_resolved`.

**Fix 4 — Expand "Raise Query" to all reviewer roles**

Change the condition from `viewLevel === 'manager'` to include `auditor`, `skip_level`, `hr_pms`, and `management`. The `raised_to` is always the employee, and the INSERT RLS policy (`raised_by = auth.uid()`) already permits any authenticated user.

**Fix 5 — Inline respond from SelfReviewSheet**

When the employee opens a KPI that has open queries raised to them, show a collapsible section with the query details and a respond form (text + evidence). Uses `useRespondToQuery` from `useQueryWorkflow.ts`.

### Files Changed
- Database migration (1 new RLS policy)
- `src/hooks/useKpis.ts` — add `evidence_url` param to `useRaiseQuery`, add notification insert
- `src/hooks/useQueryWorkflow.ts` — add notification inserts on respond/accept
- `src/components/review/UnifiedScorecard.tsx` — evidence upload in query dialog, expand role access
- `src/components/review/EmployeeScorecard.tsx` — evidence upload in query dialog
- `src/components/review/SelfReviewSheet.tsx` — inline respond section for open queries

