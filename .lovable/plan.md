## Root cause

The Incentive Data Entry "Download Excel" calls `resolveDailyExportData()` in `src/lib/incentiveExportData.ts`, which embeds departments via:

```
.select('id, full_name, ..., departments(name)')
```

PostgREST sees **three** relationships between `profiles` and `departments`:

1. `profiles_department_fk` (profiles.department_id → departments.id)
2. `departments_head_user_id_fkey` (departments.head_user_id → profiles.id)
3. `departments_head_updated_by_fkey` (departments.head_updated_by → profiles.id)

so the unhinted `departments(name)` embed is ambiguous and PostgREST returns:
*"Could not embed because more than one relationship was found for 'profiles' and 'departments'"*.

Every other hook in the codebase already uses the explicit hint `departments!profiles_department_fk(name)` (enforced by `src/test/profilesDepartmentsEmbedDisambiguation.test.ts`). The two queries in `incentiveExportData.ts` are the last unhinted ones and slipped past the guard.

## Risk & Impact

- **Data**: None — read-only `select` change.
- **Workflow**: Fixes broken Excel export; no functional change otherwise.
- **UI**: Removes the red "Export failed" toast; export proceeds normally.
- **Regression risk**: Low. Same hinted pattern used in 15+ other hooks.
- **Mitigation**: Extend the existing disambiguation test to also scan `src/lib/**`, not just `src/hooks/**`, so future unhinted embeds anywhere in the app fail CI.

## Plan

1. **Fix** `src/lib/incentiveExportData.ts` — replace both `departments(name)` embeds (lines 69 and 168) with `departments!profiles_department_fk(name)`.
2. **Harden test** `src/test/profilesDepartmentsEmbedDisambiguation.test.ts` — broaden its file glob to cover `src/lib/**` and `src/services/**` so this class of bug can't reach prod again.
3. **Verify** — run vitest for the disambiguation test, then exercise the Download Excel button against Metal Sizing / June 2026 to confirm the toast is gone and the workbook downloads with rows.
4. **Docs** — append a short entry to `DOCUMENTATION.md` (Version History) and `POLICY.md` (EMBED-FK-HINT rule now covers `src/lib` + `src/services`).

No schema, RLS, or business-logic changes. Pagination and existing scoping behaviour untouched.