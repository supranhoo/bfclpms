
## Root Cause

The Incentive Report (`useIncentiveRecords` in `src/hooks/useIncentiveRecords.ts`) loads rows from `employee_incentive_records` with a **direct PostgREST embed of `profiles`**:

```ts
.select('*, profiles:employee_id(full_name, employee_code, department_id, designation, departments!profiles_department_fk(name)), ...')
```

`public.profiles` is governed by RLS that only lets a user read profiles they're authorised to see (self, direct reports, admins/platform-owners, HR-PMS, etc.). When the embed is denied, PostgREST silently returns `profiles: null` for those rows — the incentive row still loads (it lives in `employee_incentive_records`, which a manager can read for their scope), but the **Employee / Code / Department / Designation cells render blank**.

Verified against the DB:
- **Ankit Choudhary** → roles `admin, platform_owner` → reads every profile → sees all names.
- **Upendra Singh** → role `manager` → embed returns null for everyone outside his direct-report tree → blank employee column.

This is exactly the pattern `mem://architecture/profiles-query-policy` and `src/test/profileDirectoryRpcUsage.test.ts` already forbid for other hooks (`useIncentiveVesselRates`, `useVesselMonthlyEntries`, `useSentBackOrgKpiEmployees`, `useMentionSearch`). `useIncentiveRecords` was missed.

## Risk & Impact

- **Data:** No schema/RLS change to `profiles`. One PL/pgSQL function is widened (additive columns) — `get_profile_directory_entries` already runs as `SECURITY DEFINER` and is the SSOT for directory lookups, so this preserves the policy that non-admins can resolve names/codes/dept/designation for IDs they're allowed to see in a business context (here: incentive records their RLS already returned).
- **Workflow:** None. Read-only display fix.
- **UI/UX:** Employee, Code, Department, Designation columns populate for all roles. No layout/visual change.
- **Regression:** Search/sort by name/code/dept/designation continues to work because the same fields are merged onto each row. Add a regression test extending `profileDirectoryRpcUsage.test.ts` to cover `useIncentiveRecords`.
- **Scalability:** Single batched RPC call with the row's employee IDs (≤ a few hundred per period). Same volume as the current embed.
- **Rollback:** Revert the hook + migration; the embed still compiles. Additive RPC change is safe to drop.

## Plan

1. **Extend the directory RPC** (`supabase/migrations/...`):
   - Add a new `SECURITY DEFINER` function `public.get_profile_directory_entries_v2(_ids uuid[])` returning `(id, full_name, employee_code, designation, department_id, department_name, is_active)`.
   - Grant `EXECUTE` to `authenticated`. Existing v1 stays untouched so other callers don't churn.
   - Internally joins `profiles` → `departments` with the same definer privileges already used by v1; no new PII exposed (designation/department are already shown in every other report a non-admin can see).

2. **Refactor `src/hooks/useIncentiveRecords.ts`:**
   - Drop the `profiles:employee_id(...)` embed; select only `employee_incentive_records.*` (+ the existing `incentive_slabs` embed).
   - Collect distinct `employee_id`s and call `supabase.rpc('get_profile_directory_entries_v2', { _ids })` in a single batched call.
   - Merge results onto each record as `r.profiles = { full_name, employee_code, designation, department_id, departments: { name } }` so the existing UI/filter/sort/export code in `MonthlyIncentiveTable.tsx` keeps working with **zero component changes**.

3. **Tests / guardrails:**
   - Extend `src/test/profileDirectoryRpcUsage.test.ts` to assert `useIncentiveRecords` uses `get_profile_directory_entries` (any version) and contains no direct `profiles` select.
   - Add a unit test for the merge helper using mock RPC output (happy path + missing-id falls back to `'Unknown'`).

4. **Docs / Policy:**
   - `DOCUMENTATION.md` — Version History entry: "Incentive Report names now resolved via directory RPC (fixes blank Employee column for non-admin roles)."
   - `POLICY.md` — add `useIncentiveRecords` to the list of hooks covered by the profile-directory-only rule.

## What stays untouched

- `MonthlyIncentiveTable.tsx` rendering, search, sort, export — same `r.profiles.*` shape.
- `employee_incentive_records` RLS, computation, confirm/mark-paid mutations.
- `profiles` table RLS, the v1 RPC, and every other consumer.
