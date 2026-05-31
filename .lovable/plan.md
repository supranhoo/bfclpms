## Root Cause
The `profiles` table exposes the human-readable employee identifier as `employee_code` (confirmed via schema). The Increment Inputs import and hook still query `profiles.employee_id`, which does not exist, producing the toast `column profiles.employee_id does not exist`. The internal FK `increment_inputs.employee_id` (UUID → profiles.id) is unrelated and stays unchanged.

## Changes (surgical, UI/data-mapping only — no business logic, schema, or RLS changes)

### 1. `src/pages/incentive/IncrementInputs.tsx`
- `handleFile` profile lookup:
  - `.select('id, employee_code')`
  - `.in('employee_code', codes)`
  - Map: `new Map(profs.map(p => [String(p.employee_code), p.id]))`
- Display fallbacks: replace `r.employee?.employee_id` with `r.employee?.employee_code` (lines ~146, ~195, ~302).

### 2. `src/hooks/useIncrementInputs.ts`
- Update the join select to: `employee:profiles!increment_inputs_employee_id_fkey(id, full_name, employee_code)` so the rendered "code" column actually populates.

### 3. Verify
- Re-run import with the Excel template — toast should switch from "Import failed" to success and rows render with employee + code.

## Out of scope
No schema migration, no RLS change, no template column rename (template already uses `employee_code`).
