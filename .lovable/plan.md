

## Fix: Sent-Back KPIs Tab Should Only Show Unresubmitted KPIs

### Root Cause

The "Sent Back KPIs" tab (Tab 3 in Pending Self Reviews) queries `kpi_queries` with `query_type = 'send_back'` and `status = 'open'`, then joins to the `kpis` table — but does **not** check the KPI's current workflow status. So if a KPI was sent back, the employee resubmitted it (moving it to `self_review` → `manager_check` → ... → `audit`), and the send_back query was never formally resolved, the KPI still appears in the Sent Back tab even though the employee has already acted on it.

The dashboard views (Self Review, Manager Review, Audit, etc.) are **not affected** — they filter purely by KPI status and have no send-back exclusion logic. So the KPI correctly appears at its actual level (e.g., audit). The problem is only in Tab 3.

### Fix

**Modified: `src/hooks/usePendingSelfReviews.ts`** — `useSentBackKpisTab` function

Add `.eq('status', 'kra_set')` to the KPI query (line ~498) so that only KPIs still waiting for employee resubmission appear in the Sent Back tab. Once the employee resubmits (status moves past `kra_set`), the KPI disappears from this tab and flows through the normal workflow dashboards.

```typescript
// Line ~498: add status filter
.eq('is_org_level', false)
.eq('status', 'kra_set')          // ← ADD THIS
.in('frequency', ['Monthly', 'Daily', 'Weekly']);
```

### Impact
- Tab 1 (Overdue Self Review): Unchanged — sent-back KPIs at `kra_set` remain excluded as before
- Tab 3 (Sent Back): Now only shows KPIs the employee has **not yet resubmitted**
- Dashboard views: Unaffected — KPIs show at their actual workflow level regardless of send-back query status

### No database changes needed

