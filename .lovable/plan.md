

## Fix: Add 'division' to incentive_program_mappings CHECK constraint

### Problem
The `incentive_program_mappings` table has a CHECK constraint that only allows: `'department', 'business_unit', 'designation', 'pms_grade', 'employee'`. The Division tab was added to the UI but `'division'` was never added to this constraint.

### Fix — One database migration

Drop the old CHECK constraint and recreate it with `'division'` included:

```sql
ALTER TABLE public.incentive_program_mappings
  DROP CONSTRAINT incentive_program_mappings_mapping_type_check;

ALTER TABLE public.incentive_program_mappings
  ADD CONSTRAINT incentive_program_mappings_mapping_type_check
  CHECK (mapping_type IN ('division', 'department', 'business_unit', 'designation', 'pms_grade', 'employee'));
```

### Files
- DB migration only — no code changes needed

