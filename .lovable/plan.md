
# Replicate January Org KPIs to February and March 2026

## Current State

- **January 2026**: 109 distinct Org KPI identities across 554 employee records
- **February 2026**: 15 Org KPI identities are completely missing (no employee records at all), and 33 existing employee records need to be flagged as `is_org_level = true`
- **March 2026**: 31 Org KPI identities are completely missing, and 28 existing employee records need to be flagged as `is_org_level = true`
- **Data Owners**: Assigned globally by `(category_id, kra_name, kpi_name)` -- no per-period mapping needed. Once KPIs are marked org-level, data owners automatically have access.

## Plan

### Step 1: Flag existing Feb/March KPIs as Org-level

Update KPIs that already exist in February and March (from rollover) but aren't marked as `is_org_level = true` to match their January org-level status and scope.

```sql
-- February: ~33 records
UPDATE kpis SET is_org_level = true, org_level_scope = j.org_level_scope
FROM kpis j
WHERE kpis.review_period = 'February' AND kpis.review_year = 2026
  AND kpis.is_org_level = false
  AND j.is_org_level = true AND j.review_period = 'January' AND j.review_year = 2026
  AND j.category_id = kpis.category_id AND j.kra_name = kpis.kra_name
  AND j.kpi_name = kpis.kpi_name AND j.employee_id = kpis.employee_id;

-- March: ~28 records (same pattern)
```

### Step 2: Insert missing employee KPI records

For Org KPIs that exist in January but have no corresponding employee records in February or March, insert new KPI records copying all configuration from the January source.

```sql
-- Insert missing Feb records (~15 KPI identities x employees)
INSERT INTO kpis (employee_id, category_id, kra_name, kpi_name, target_value,
  uom, uom_type, weightage, frequency, sub_frequency, criteria, source_of_data,
  r5, r4, r3, r2, r1, r0, threshold_mode, qualitative_options,
  is_org_level, org_level_scope, ref_code, day_count_type,
  frequency_cycle_start, require_resubmit_reason,
  review_period, review_year, status)
SELECT employee_id, category_id, kra_name, kpi_name, target_value,
  uom, uom_type, weightage, frequency, sub_frequency, criteria, source_of_data,
  r5, r4, r3, r2, r1, r0, threshold_mode, qualitative_options,
  true, org_level_scope, ref_code, day_count_type,
  frequency_cycle_start, require_resubmit_reason,
  'February', 2026, 'kra_set'
FROM kpis
WHERE is_org_level = true AND review_period = 'January' AND review_year = 2026
AND NOT EXISTS (
  SELECT 1 FROM kpis k2
  WHERE k2.category_id = kpis.category_id AND k2.kra_name = kpis.kra_name
  AND k2.kpi_name = kpis.kpi_name AND k2.employee_id = kpis.employee_id
  AND k2.review_period = 'February' AND k2.review_year = 2026
);

-- Same for March
```

### Step 3: No data owner changes needed

Data owner assignments in `org_kpi_data_owners` are keyed by `(category_id, kra_name, kpi_name)` without any period column. Once the KPIs exist and are marked `is_org_level = true` in Feb/March, the existing data owner assignments automatically grant the correct access.

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|------------|
| Data Impact | Low -- only adds missing records or flags existing ones | Uses NOT EXISTS to prevent duplicates; existing data untouched |
| Workflow Impact | None -- new records start in `kra_set` status | Normal review cycle applies |
| Regression | None -- read-only for existing approved/reviewed KPIs | Only touches unflagged or missing records |

## Technical Details

- All SQL will be executed via the insert tool (data operations, not schema changes)
- `POLICY.md` will be updated with a note about the bulk replication
- Estimated records: ~60+ new inserts for Feb, ~100+ for March, plus ~61 updates
