
## Goal

Fix the Incentive Report error reported by Sandeep — *"Could not embed because more than one relationship was found for 'profiles' and 'departments'"* — and sweep every other hook that uses the same ambiguous embed so the same class of bug does not resurface on another screen.

## Root Cause (one-liner)

`departments` now has two FKs back into `profiles` (`head_user_id`, `head_updated_by`) in addition to `profiles.department_id → departments.id`. PostgREST sees 3 relationships and refuses to pick one when the embed is written implicitly as `departments(name)`. The Sandeep production fix earlier today patched the Production Daily / Vessel hooks but missed `useIncentiveRecords`, which is what the Incentive Report uses.

## Fix

Replace every implicit `departments(...)` embed *via profiles* with the explicit FK hint `departments!profiles_department_fk(...)`. Same row shape, no schema change.

### Files to update (surgical, single-line edits each)

1. `src/hooks/useIncentiveRecords.ts` — lines 12 & 177 (the actual Incentive Report regression)
2. `src/hooks/useIncentiveRevisions.ts` — line 11
3. `src/hooks/useMonthlyTrend.ts` — line 163
4. `src/hooks/useCompliancePenalty.ts` — lines 138, 448
5. `src/hooks/useAdminReports.ts` — line 141
6. `src/hooks/useOrgKpiImpact.ts` — line 67
7. `src/hooks/useActiveEmployeesForCopy.ts` — line 26
8. `src/hooks/usePendingSelfReviews.ts` — lines 78, 193, 730, 888, 959, 1152
9. `src/hooks/useTemplateBundles.ts` — lines 66, 104
10. `src/hooks/useTNI.ts` — lines 106, 238

(`useIncentivePrograms.ts:75` embeds `departments` directly off `incentive_programs`, not via profiles — leave alone unless verified ambiguous.)

### Example transform

```text
- profiles:employee_id(full_name, employee_code, department_id, designation, departments(name))
+ profiles:employee_id(full_name, employee_code, department_id, designation, departments!profiles_department_fk(name))
```

## Tests

Add `src/test/profilesDepartmentsEmbedDisambiguation.test.ts`:

- Reads each hook file listed above.
- Asserts: zero matches for the pattern `\bdepartments\s*\(` that are **not** preceded by `!profiles_department_fk`.
- Guards against future regression — any new hook reintroducing the ambiguous embed will fail CI.

## Documentation & Policy

- `DOCUMENTATION.md` → bump version, add a "PostgREST embed disambiguation" note under the Incentive Report fix entry.
- `POLICY.md` → extend `§PII-DIRECTORY-RPC` with a new sub-rule **§EMBED-FK-HINT**: any embed of `departments` reached *through* `profiles` MUST use the explicit `departments!profiles_department_fk` hint. Direct `incentive_programs → departments` etc. are unaffected.

## Rollback

Revert the edited hooks; no schema or migration change is involved.

## Out of Scope

- No RLS, grant, or migration changes.
- No UI changes.
- `useIncentivePrograms.ts` (different FK path) — flagged for follow-up only if a future report surfaces the same error there.
