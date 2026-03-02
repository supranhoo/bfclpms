

# Fix: Weightage Distribution Broken After Org KPI Replication

## Root Cause Analysis

Three distinct issues are causing the weightage fluctuations:

### Issue 1: Duplicate Org KPIs in February (15 employees over 100%)
The org KPI replication done today (Mar 2) used exact `kpi_name` matching for deduplication. However, some Org KPIs have the **same KRA name** but slightly different KPI name text (e.g., typo "Adherenec" vs "Adherence"). This caused the replication to insert a second KPI under the same KRA for 10 employees, adding 1.5-7% extra weightage on top of their existing 100%.

**Affected**: 10 duplicate KPI records in February, all created on Mar 2.

### Issue 2: March Rollover Never Ran (46 employees under 100%)
The cron job fix (adding `X-Cron-Secret`) was applied today. The March 1 cron used the **old broken cron** (no `X-Cron-Secret`), so it failed silently. March currently has only:
- 60 KPIs for 4 manually-rolled employees
- 1,146 org-only KPIs added by today's replication for 89 employees

Most March employees only have their org KPIs (5-30% weightage) but are missing all their non-org KPIs, resulting in totals far below 100%.

### Issue 3: Rollover Edge Function Doesn't Carry Org Flags (Future Risk)
The `buildNewKpi` function already copies `is_org_level` and `org_level_scope` -- so this is actually fine. No code change needed here.

## Fix Plan

### Step 1: Delete 10 duplicate February KPIs
Remove the duplicate org KPIs created on Mar 2 that have a same-KRA sibling from before Mar 2. This restores all 10 affected employees back to exactly 100%.

```sql
DELETE FROM kpis WHERE id IN (
  '4747a86e-...', 'af82da41-...', ... -- 10 specific IDs
);
```

### Step 2: Run Manual Feb-to-March Rollover
Trigger the `auto-rollover-kpis` edge function manually with:
- `source_month: February`, `source_year: 2026`
- `target_month: March`, `target_year: 2026`
- `force: true`

This will copy all non-org KPIs from February to March. The `NOT EXISTS` check will skip org KPIs that already exist from today's replication.

### Step 3: Delete any resulting March duplicates
After rollover, check if any March employees exceed 100% due to same-KRA duplicates (same pattern as Feb). Delete any duplicates found.

### Step 4: Flag rolled-over March KPIs as Org-level
The Feb-to-March rollover will carry `is_org_level` flags (since `buildNewKpi` copies them). But verify and flag any that were missed.

### Step 5: Update POLICY.md
Add a note about the data correction and the duplicate-detection logic for org KPI replication.

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|------------|
| Data Impact | Low -- deleting only confirmed duplicates by specific ID | Pre-verified: all 10 affected employees go from 107% back to 100% |
| Rollover Safety | Low -- uses existing edge function with NOT EXISTS check | Org KPIs already in March will be skipped |
| Regression | None -- no code changes, only data correction + manual rollover trigger | |

## Expected Outcome

| Period | Before Fix | After Fix |
|--------|-----------|-----------|
| January | 78 at 100%, 2 over, 1 under | No change |
| February | 74 at 100%, 15 over, 3 under | ~89 at 100%, ~0 over, ~3 under |
| March | 37 at 100%, 9 over, 46 under | ~88 at 100%, ~0 over, ~4 under |

