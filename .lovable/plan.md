

# Fix: KRA Rollover Balance-Only Mode Skips Legitimate Missing KPIs

## Problem
Employee 200086 (Deepak Kumar) has 19 KPIs in February and 18 in March. The dry-run correctly identified 2 missing KPIs ("Proactive Safety Reporting" and a duplicate "Total Recordable Injury (STI)"), but the actual rollover copied 0.

## Root Cause
The deduplication logic at line 234-235 in `auto-rollover-kpis/index.ts` is **too aggressive**:

```typescript
const missingKpis = kpis.filter(k => 
  !existingKeys.has(`${k.kra_name}|||${k.kpi_name}`) && !existingKras.has(k.kra_name)
);
```

This requires **both** conditions:
1. No exact `kra_name + kpi_name` match in target — ✅ correct
2. No KRA with same `kra_name` exists at all in target — ❌ too aggressive

The KRA "Ensure Zero Harm workplace" already has 4 KPIs in March. So the `!existingKras.has(k.kra_name)` check returns `false` for ALL source KPIs under that KRA, including the genuinely missing "Proactive Safety Reporting" KPI.

The KRA-level check was added to prevent duplicates when org-KPI replication uses different `kpi_name` variants. But it should only apply in the "no existing KPIs" branch (line 282-305), not in the "balance only" branch (line 231-267) where exact `kra+kpi` matching is already done.

## Fix

**File: `supabase/functions/auto-rollover-kpis/index.ts`**

Remove the `!existingKras.has(k.kra_name)` condition from the balance-only branch (line 234-235). The exact `kra_name|||kpi_name` check is sufficient to prevent duplicates:

```typescript
// Before (line 234-235):
const missingKpis = kpis.filter(k => 
  !existingKeys.has(`${k.kra_name}|||${k.kpi_name}`) && !existingKras.has(k.kra_name)
);

// After:
const missingKpis = kpis.filter(k => 
  !existingKeys.has(`${k.kra_name}|||${k.kpi_name}`)
);
```

The KRA-level guard remains in the "no existing KPIs" branch (line 286) where it serves its intended purpose of preventing duplicates from org-KPI naming variants.

**1 file change + redeploy. No DB migration.**

