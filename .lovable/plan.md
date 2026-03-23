

## Fix: Admin Data Entry Still Uses Wrong Workflow (Pending Implementation)

### Root Cause

This is the **same bug** identified earlier for Vivek's KPIs. The approved plan to fix it was never implemented. Two issues remain:

1. **`useAdminDataEntry.ts` line 250**: `get_employee_workflow` is called **without** `review_period` and `review_year`. This returns Vivek's global workflow (which lacks `audit`), instead of his period-specific workflow (which includes `audit`).

2. **`workflowEngine.ts` line 185**: The `auditor` case fallback is `'management_review'`. Since `audit` isn't found in the (incorrectly resolved) global workflow, the KPI advances to `management_review` — a stage not in Vivek's actual workflow. It should fall back to `'approved'`.

**Result**: The KPI lands at `management_review` instead of `approved`. The trigger only fires `kpi_finalized` on transition to `approved`, so no notification and no email.

### Changes

#### 1. `src/hooks/useAdminDataEntry.ts` (line ~248-252)

Before calling `get_employee_workflow`, fetch the KPI's `review_period` and `review_year` and pass them to the RPC:

```typescript
const { data: kpiPeriod } = await supabase
  .from('kpis')
  .select('review_period, review_year')
  .eq('id', kpi_id)
  .single();

const rpcParams: Record<string, unknown> = { employee_uuid: employee_id };
if (kpiPeriod?.review_period && kpiPeriod?.review_year) {
  rpcParams.p_review_period = kpiPeriod.review_period;
  rpcParams.p_review_year = kpiPeriod.review_year;
}

const { data: stagesData } = await supabase
  .rpc('get_employee_workflow', rpcParams as any);
```

#### 2. `src/lib/workflowEngine.ts` (line 185)

Change auditor fallback from `'management_review'` to `'approved'`:

```typescript
case 'auditor':
  return resolveNextStatus('audit', workflowStages) || 'approved';
```

#### 3. Database migration: Fix stuck KPIs

Move Vivek's two stuck KPIs from `management_review` → `audit`:

```sql
UPDATE kpis SET status = 'audit', updated_at = now()
WHERE id IN (
  'bdb75782-795a-43fe-8c4d-3e53222c1378',
  '292c74e8-784f-4d2e-b1be-651de23ad91c'
) AND status = 'management_review';
```

### No other changes needed

The notification trigger is already correct (CASE 5 covers all transitions to `approved`). Once the workflow resolves correctly, the KPI will reach `approved` and the email will fire.

