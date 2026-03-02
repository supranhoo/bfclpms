

# Fix: Remaining Weightage Fluctuations in March 2026

## Root Cause

The earlier org-KPI replication from **January to March** and the subsequent **Feb-to-March rollover** both inserted KPIs into March, but they used **different KPI names for the same KRA**. Since deduplication uses exact `kra_name + kpi_name`, both versions ended up in March, causing:

**7 employees over 100%** -- They have duplicate KPIs under the same KRA (one from January's org-replication, one from February's rollover) with different `kpi_name` text but overlapping weightage.

**10 employees under 100%** -- Some February KPIs were NOT rolled over to March. These employees are missing KPIs that exist in Feb (100% there) but are absent in March. In many cases, a sibling KPI under the same KRA exists in March with a different name and different weightage, causing shortfalls of 1-13%.

## Summary of Affected Employees

### Over 100% (7 employees)
| Employee | March Total | Excess | Cause |
|----------|-------------|--------|-------|
| Dummy | 152% | +52% | 11 extra KPIs from org-replication (entirely different KPI set from Feb) |
| Amit Kumar Shaw | 110% | +10% | 2 duplicate KRAs: "Timely Payment" and "Timely submission of reports" |
| Vivek Kumar Dansena | 110% | +10% | Duplicate KRAs from org-replication |
| Dileshwar Mahto | 103% | +3% | Duplicate "Automation & Digitalization" KRA |
| Biswajit Sahoo | 101.5% | +1.5% | Duplicate "Logistics & Dispatch" KRA |
| Parshu Ram Shukla | 101.5% | +1.5% | 4 KPIs under "Ensure Zero Harm workplace" (legitimate, not duplicates) |
| V.A.V.S.S. Ganapathi Varma | 101.5% | +1.5% | Same pattern as Parshu Ram |

### Under 100% (10 employees, 8 with missing Feb KPIs)
| Employee | March Total | Missing | Cause |
|----------|-------------|---------|-------|
| Anant Shankar Shet | 87% | 13% | 2 Feb KPIs not rolled (different kpi_name siblings exist in March) |
| Piyush Bansal | 95% | 5% | 1 missing KPI |
| Sanjay Kumar Dubey | 95% | 5% | 1 missing KPI |
| Sanjeeb Kumar Jena | 96% | 4% | 2 missing safety KPIs |
| Bhoopendra Kumar Sinha | 98% | 2% | 1 missing safety KPI |
| Anil Kumar Pathak | 99% | 1% | 1 missing safety KPI |

## Fix Plan

### Step 1: Delete duplicate March KPIs (over-100% employees)

For employees whose March total exceeds 100%, identify KPIs that are duplicates under the same KRA. Delete the version that came from the January org-replication (since February is the correct source month for March).

**Logic**: For each over-100% employee in March, find KRA names that have multiple KPIs. Compare against February: keep the KPI name that matches February, delete the one that only matches January.

**Special case -- Dummy user**: This user has an entirely different KPI set in February vs January. Delete all 8 KPIs created on Mar 2 (from rollover) that don't exist in February, since their Feb set (created Feb 13) is already correct.

**Special case -- Parshu Ram and Ganapathi Varma**: These have 4 legitimate KPIs under "Ensure Zero Harm workplace" (all org-level, all distinct). Their 101.5% likely reflects a genuine weightage configuration issue in the source data, not a duplication bug. These will be flagged for admin review rather than auto-fixed.

### Step 2: Insert missing March KPIs (under-100% employees)

For employees whose March total is under 100% but February total is 100%, copy the missing February KPIs to March.

**Logic**: For each under-100% employee, find Feb KPIs where no March record exists with the same `kra_name + kpi_name`. Insert them with `status = 'kra_set'`, copying all configuration from February.

### Step 3: Fix the rollover edge function dedup logic

The root cause is that the rollover function uses exact `kra_name + kpi_name` matching, but the org-KPI replication from January used January's KPI names which differ from February's. To prevent this in future:

- Update the rollover function's `NOT EXISTS` check to also match on `kra_name` alone when there's only one KPI per KRA, preventing same-KRA duplicates.
- This is a code change to `supabase/functions/auto-rollover-kpis/index.ts`.

### Step 4: Update POLICY.md

Document the data correction and the improved dedup logic.

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|------------|
| Data Impact | Low | Deleting only confirmed duplicates; inserting only confirmed missing records |
| Workflow Impact | None | New records start as `kra_set` |
| Code Change | Low | Rollover dedup improvement is additive, doesn't change existing matching |

## Expected Outcome

| Period | Before | After |
|--------|--------|-------|
| March | 77 at 100%, 7 over, 10 under | ~87 at 100%, ~2 flagged for review, ~3 pre-existing under |

