

# Sync Org KPI Mappings Between January and February 2026

## Current State

| Period | Unique Org KPIs |
|---|---|
| January | 98 |
| February | 68 |

## Gaps Found

| Gap Type | Count | Details |
|---|---|---|
| In January but NOT in February | 41 unique KPIs | 37 have Feb KPI records (just need `is_org_level = true`); 4 have no Feb records at all (cannot be marked -- KPI records don't exist in Feb) |
| In February but NOT in January | 11 unique KPIs | All 11 have Jan KPI records (just need `is_org_level = true`) |

## What Will Be Done

This is purely a **data update** -- no code changes needed. Two SQL UPDATE statements will be run:

### Step 1: Mark Jan-only KPIs as Org-Level in February

For the 37 KPIs that exist in both months but are only marked as org-level in January, set `is_org_level = true` and copy the `org_level_scope` from the January record onto the matching February KPI records.

4 KPIs have no February records at all -- these cannot be synced since the underlying KPI records don't exist for February. These will be skipped.

### Step 2: Mark Feb-only KPIs as Org-Level in January

For the 11 KPIs that exist in both months but are only marked as org-level in February, set `is_org_level = true` and copy the `org_level_scope` from the February record onto the matching January KPI records.

### Step 3: Update DOCUMENTATION.md

Version bump to 1.45.38 and note the Org KPI sync.

## Expected Outcome

| Period | Before | After |
|---|---|---|
| January | 98 org KPIs | 98 + 11 = 109 org KPIs |
| February | 68 org KPIs | 68 + 37 = 105 org KPIs |

The 4 KPIs that only exist in January (no Feb KPI records at all) will remain Jan-only since there are no employee KPI records to mark in February.

## Technical Details

Two UPDATE queries using subqueries to match across periods:

```sql
-- Query 1: Jan org KPIs -> mark matching Feb records
UPDATE kpis feb
SET is_org_level = true,
    org_level_scope = jan.org_level_scope
FROM (
  SELECT DISTINCT category_id, kra_name, kpi_name, org_level_scope
  FROM kpis
  WHERE is_org_level = true AND review_period = 'January' AND review_year = 2026
) jan
WHERE feb.category_id = jan.category_id
  AND feb.kra_name = jan.kra_name
  AND feb.kpi_name = jan.kpi_name
  AND feb.review_period = 'February'
  AND feb.review_year = 2026
  AND feb.is_org_level = false;

-- Query 2: Feb org KPIs -> mark matching Jan records
UPDATE kpis jan
SET is_org_level = true,
    org_level_scope = feb.org_level_scope
FROM (
  SELECT DISTINCT category_id, kra_name, kpi_name, org_level_scope
  FROM kpis
  WHERE is_org_level = true AND review_period = 'February' AND review_year = 2026
) feb
WHERE jan.category_id = feb.category_id
  AND jan.kra_name = feb.kra_name
  AND jan.kpi_name = feb.kpi_name
  AND jan.review_period = 'January'
  AND jan.review_year = 2026
  AND jan.is_org_level = false;
```

No code changes, no schema changes -- data-only operation.

