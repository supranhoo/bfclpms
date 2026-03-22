

## RCA: Sent Back KPIs Tab Shows 0 Incorrectly

### Root Cause

In `src/hooks/usePendingSelfReviews.ts`, line 667, the `useSentBackKpisTab` hook filters KPIs with:

```
.eq('status', 'kra_set')
```

This means it only shows sent-back KPIs that are still at `kra_set` status. However:

1. When a KPI is sent back, it moves to `kra_set` and a `kpi_queries` record with `query_type = 'send_back'` and `status = 'open'` is created.
2. When the employee **resubmits**, the KPI status moves to `self_review` (or further). But the send_back query remains `open` until the reviewer explicitly resolves it.
3. The `.eq('status', 'kra_set')` filter **excludes** all resubmitted KPIs that are now at `self_review`, `manager_check`, etc. -- even though they still have an unresolved send-back query.

So the tab only catches KPIs where the employee hasn't resubmitted yet. Any KPI that was sent back and then resubmitted (but not yet resolved by the reviewer) disappears from this tab.

### Fix

#### File: `src/hooks/usePendingSelfReviews.ts` (~line 667)

Remove the `.eq('status', 'kra_set')` filter. Instead, exclude only terminal statuses (`approved`) so the tab shows all KPIs with an open send-back query that haven't reached final approval.

Change:
```typescript
.eq('is_org_level', false)
.eq('status', 'kra_set')
.in('frequency', ['Monthly', 'Daily', 'Weekly']);
```

To:
```typescript
.eq('is_org_level', false)
.not('status', 'eq', 'approved')
.in('frequency', ['Monthly', 'Daily', 'Weekly']);
```

This ensures:
- KPIs sent back and still pending with employee (`kra_set`) are shown
- KPIs sent back and resubmitted but pending with manager/auditor (`self_review`, `manager_check`, etc.) are also shown
- Only fully approved KPIs are excluded

#### Also in `src/pages/admin/PendingSelfReviews.tsx`

Add a "Status" column to the Sent Back table so admins can see where each sent-back KPI currently stands (e.g., `kra_set` = with employee, `self_review` = with manager). This requires adding `status` to the `SentBackKpi` interface and the query select.

### No database changes needed

