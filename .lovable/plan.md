

# Fix: Duplicate KPIs in February and March 2026

## Root Cause

The original KPI import on Feb 17 created exact duplicate records for 6 employees (same employee, same KRA name, same KPI name, same period). These duplicates were then carried forward to March during the rollover, creating 14 more duplicates there. The duplicates affect multiple KPI types (LTI, Preventive Maintenance, Power Generation, etc.) across 8 employees.

## Impact

- **February**: 15 duplicate KPI records across 8 employees
- **March**: 14 duplicate KPI records across 8 employees  
- **Total**: 29 records to delete
- This causes doubled weightage for affected KPIs (e.g., 2% LTI appearing twice = 4% total)

## Affected Employees

Badal Kumar Ravi, Deepak Kumar, Md Humayun, Pradip Duary, Ritesh Kumar Singh, Shiv Prakash Rai, Gaurav Tiwari, Dummy, and a few others.

## Fix Plan

### Step 1: Delete 29 duplicate KPI records

For each duplicate group (same employee + period + KRA + KPI name), keep the record with the most advanced workflow status (e.g., "approved" over "self_review" over "kra_set"). Delete the other.

The 29 specific IDs have been identified and verified. All records to delete are either at `kra_set` or `self_review` status (none have progressed to approval), so no review data will be lost.

### Step 2: Clean up orphaned review_submissions

Check if any of the deleted KPI IDs have associated `review_submissions` records and clean them up.

### Step 3: Verify weightage totals

After deletion, confirm that the affected employees return to 100% weightage.

### Step 4: Add unique constraint to prevent future duplicates

Add a database unique index on `(employee_id, review_period, review_year, kra_name, kpi_name)` to prevent this class of duplicate from ever occurring again.

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|------------|
| Data Impact | Low | Only deleting exact duplicates; keeping the more advanced record |
| Review Data | None | All duplicates are at early stages (kra_set/self_review) |
| Future Prevention | Unique index prevents recurrence |

## Technical Details

- 29 specific record IDs identified via ranked deduplication query
- February: 15 deletions, March: 14 deletions
- Unique index will use COALESCE for nullable review_period column

