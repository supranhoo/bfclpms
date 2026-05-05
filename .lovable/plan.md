# Fix: "record \"v_src\" is not assigned yet" on department → employee scope change

## Root Cause (verified)

The error originates in the DB function `migrate_okv_on_scope_change` (migration `20260421181848`, lines 60–355).

`v_src` is declared as a generic PL/pgSQL `record`:
```sql
v_src record;
```

A `record` variable has **no row type until its first `SELECT INTO` succeeds**. In the SPLIT path:

- For `organization → employee` / `organization → department`, line 221 does `SELECT * INTO v_src FROM org_kpi_values …` — assigns a row type, fine.
- For `department → employee` (your screenshot), line 233 explicitly does `v_src := NULL;` and the org-wide SELECT is skipped.

Later in the per-employee loop, the audit insert (lines 278–288) builds:
```sql
CASE WHEN p_old_scope = 'organization' THEN v_src.id ELSE NULL END
CASE WHEN p_old_scope = 'organization' THEN to_jsonb(v_src) ELSE NULL END
```
PL/pgSQL must resolve the **field reference `v_src.id`** at execution time, even though the CASE branch is never taken. Since `v_src` was never assigned a row, PostgreSQL raises:

> record "v_src" is not assigned yet

That's exactly the toast you see. So the dept → employee split aborts before any data changes — no rows are corrupted, but the scope change fails entirely.

## Risk & Impact Report

- **Data Impact**: None (the function aborts cleanly; transaction rolls back). Fix is purely a typing change in the function body.
- **Workflow Impact**: Restores ability to split department-scope Org KPIs into per-employee scope (the case visible in your screenshot, which also affected the cascade to May 2026).
- **UI/UX**: None.
- **Regression Risk**: Low. The fix is a `DECLARE` change from `record` to `public.org_kpi_values%ROWTYPE`, which makes `v_src.id` and `to_jsonb(v_src)` always type-resolvable (NULL fields when unassigned). All existing SELECT INTO usages remain valid.
- **Mitigation**: Add a regression migration; update tests; document the PL/pgSQL `record` vs `%ROWTYPE` rule in `mem://architecture/database/plpgsql-standards`.

## Plan

### 1. DB migration — `fix_v_src_unassigned_in_okv_migration.sql`
Recreate `public.migrate_okv_on_scope_change(...)` (same signature) with:
```sql
v_src public.org_kpi_values%ROWTYPE;
```
…instead of `v_src record;`. All other logic untouched. Removes the `v_src := NULL;` line (record%ROWTYPE defaults to all-NULL fields, which is what we want).

### 2. SSOT updates
- `POLICY.md` §88.x: add rule — "PL/pgSQL functions that conditionally access fields of a row variable MUST declare it as `%ROWTYPE`, never as bare `record`."
- `DOCUMENTATION.md` v2.66.12: bug fix entry.
- `CHANGELOG_2026.md` May W1: entry.
- `mem://architecture/database/plpgsql-standards`: append the `record` vs `%ROWTYPE` rule.
- `mem://features/admin/org-kpi-management-suite`: note the dept→employee split is now functional.

### 3. Test
- New `src/test/orgKpiScopeChangeDeptToEmployee.test.ts`: integration-style assertion that calling `change_org_kpi_scope_cascading` with `current_only`, `old_scope='department'`, `new_scope='employee'` returns success and no `v_src` error string.

## Files

**Created**
- `supabase/migrations/<ts>_fix_v_src_unassigned_in_okv_migration.sql`
- `src/test/orgKpiScopeChangeDeptToEmployee.test.ts`

**Edited**
- `POLICY.md`, `DOCUMENTATION.md`, `CHANGELOG_2026.md`
- `mem/architecture/database/plpgsql-standards`
- `mem/features/admin/org-kpi-management-suite`

Approve to apply.
