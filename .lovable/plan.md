## Root Cause

User **200291 (Sandeep Kumar, employee role)** is an Incentive Data Entry user. The Metal Sizing program has **292 employee mappings** in `incentive_program_mappings` — so the database is fine.

The breakage was introduced by the most recent security hardening migration (`20260622104035_…`), which dropped three broad `profiles` SELECT policies including **`"Incentive data entry users can view active profiles"`**. `ProductionDailyGrid.tsx` (line 105-122) reads the full active profile roster via `fetchAllPaged` and then filters those profiles against the program's mapping IDs. Without that policy, RLS now returns essentially zero rows for non-admin incentive-data-entry users, so `mappedEmployees.length === 0`, and the diagnostic empty-state correctly falls through to the message:

> "This program has no employee mappings. Open Program Mapping (Incentive Config) to add employees."

The message is misleading; the real problem is that the page can no longer see the profiles for the employees it is allowed to operate on.

## Risk & Impact Report

- **Data Impact**: No schema change. New `SECURITY DEFINER` RPC returns only the columns the grid needs (id, full_name, employee_code, designation, department_id, business_unit_id, division_id, company_id) — no email, mobile_number, DOJ, or other PII. This preserves the PII hardening intent.
- **Workflow Impact**: Restores Incentive Production / Eligibility data entry for non-admin users mapped to the program.
- **UI/UX Impact**: None visible beyond the grid populating again.
- **Regression Risk**: Low. Only the data source for `mappedEmployees` changes; downstream rate resolution, filters, save flow remain untouched.
- **Scalability**: RPC resolves mappings → employee universe server-side in a single round trip. Avoids fetching the entire ~2.5k active profile roster on the client.
- **Mitigation**: Unit test + manual verification with Sandeep's account context.

## Plan

### 1. New SECURITY DEFINER RPC

`public.get_incentive_program_employees(_program_id uuid)` returns the mapped-employee universe by resolving every `mapping_type` (`employee`, `department`, `business_unit`, `division`, `designation`) against `profiles` server-side, restricted to `is_active = true`. Returns only fields the grid needs — no PII columns. Guarded with `auth.uid() IS NOT NULL` and an `EXISTS` check that the caller has access to the Incentive Data Entry menu (matches the existing access-profile pattern used by `_shared/incentive-auth.ts`).

Grants: `EXECUTE` to `authenticated` + `service_role`; revoked from `anon`.

### 2. Frontend: `src/components/incentive/ProductionDailyGrid.tsx`

Replace the paged `profiles` fetch + client-side filter (lines 80-124) with a single `supabase.rpc('get_incentive_program_employees', { _program_id: programId })` call. The returned rows already carry `department_id`, `business_unit_id`, `division_id`, `company_id`, so the existing `resolveEmployeeCompanyId` / `resolveEmployeeRate` calls are adapted to read these flat fields instead of the nested `departments.business_units.divisions` shape.

### 3. Verification

- Vitest: extend `src/test/incentiveDataEntryEmptyStates.test.ts` with a case asserting that when the RPC returns ≥1 row the empty-state message switches away from "no employee mappings". Add a new test `src/test/incentiveProgramEmployeesRpc.test.ts` mocking the RPC to confirm the grid hook consumes it.
- Manual: simulate Sandeep's session via Playwright on `/incentive/data-entry`, pick Metal Sizing, confirm grid rows appear.

### 4. Docs / Policy

- `DOCUMENTATION.md` §Incentive Data Entry: note the RPC as the canonical mapped-employee source.
- `POLICY.md` §Incentive Mapping Paging: forbid the old `from('profiles').select(...).eq('is_active', true)` pattern in incentive grids; require the RPC.
- `mem/architecture/profiles-query-policy`: append RPC reference and the PII rationale.
- `@security-memory`: note the RPC is the sanctioned replacement for the dropped `"Incentive data entry users can view active profiles"` policy.

### 5. Untouched (called out, not changed)

The same dropped policies also affected:
- `"Authenticated users can view org kpi data owner profiles"`
- `"Authenticated users can view org kpi value enterer profiles"`

If Org KPI Data Entry users report the same symptom, they will need analogous RPCs (`get_org_kpi_*_employees`). Out of scope for this fix — flagged so we can address quickly if reported.

## Rollback

Drop the RPC and revert `ProductionDailyGrid.tsx` — fully additive change.

## Technical Detail (engineers)

```sql
CREATE OR REPLACE FUNCTION public.get_incentive_program_employees(_program_id uuid)
RETURNS TABLE (
  id uuid, full_name text, employee_code text, designation text,
  department_id uuid, business_unit_id uuid, division_id uuid, company_id uuid
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH m AS (
    SELECT mapping_type, mapping_value
    FROM public.incentive_program_mappings
    WHERE program_id = _program_id
  )
  SELECT DISTINCT p.id, p.full_name, p.employee_code, p.designation,
         p.department_id,
         d.business_unit_id,
         bu.division_id,
         COALESCE(p.company_id, div.company_id)
  FROM public.profiles p
  LEFT JOIN public.departments d   ON d.id  = p.department_id
  LEFT JOIN public.business_units bu ON bu.id = d.business_unit_id
  LEFT JOIN public.divisions div   ON div.id = bu.division_id
  WHERE p.is_active = true
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM m
      WHERE (m.mapping_type = 'employee'      AND m.mapping_value::uuid = p.id)
         OR (m.mapping_type = 'department'    AND m.mapping_value::uuid = p.department_id)
         OR (m.mapping_type = 'business_unit' AND m.mapping_value::uuid = d.business_unit_id)
         OR (m.mapping_type = 'division'      AND m.mapping_value::uuid = bu.division_id)
         OR (m.mapping_type = 'designation'   AND m.mapping_value = p.designation)
    );
$$;
```
