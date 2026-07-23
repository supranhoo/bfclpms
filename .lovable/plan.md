
## Why Jyoti (101789) can see Prabhat (101757)

Confirmed from the DB, not guessed:

- **Jyoti Prakash Dwivedi (101789)** — `departments.head_user_id = Jyoti` on dept **"1050 TPD-Process"** → she is an **HOD**.
- **Prabhat Kumar Singh (101757)** — dept **"1050 TPD-Mech"** (different department), reporting_manager = BU head.
- Both departments sit under the **same BU: "1050 TPD"** (`business_unit_id = 88e3ed27…`).

`annual_review_directory_access(Jyoti)` executes the HOD branch (resolver lines 82–117):

```
v_bu_ids := departments.business_unit_id WHERE head_user_id = Jyoti  → {1050 TPD}
v_source := 'hod'
v_scope  := 'bu'                    ← entire BU, not just her dept
```

So the search RPC returns every active employee in BU "1050 TPD" — including Prabhat in the sibling dept TPD-Mech. That is the HOD-scope leak the last plan flagged for *assist* but never closed for *search*.

## Fix (single migration + tiny UI trace update)

### 1. Add HOD-owned-department scope to the resolver

Extend `annual_review_directory_access` to compute an HOD's department set:

```sql
SELECT array_agg(id) FROM departments WHERE head_user_id = v_uid  → v_hod_dept_ids
```

Return a new `department_ids` field alongside `business_unit_ids`. Set `v_scope = 'department'` when the caller is an HOD **and not also a BU head / HR / admin**. Precedence stays: admin/hr_pms > hr_team > bu_head > **hod (dept-only)** > reporting_manager.

If a person is both HOD and BU Head, they keep `bu` scope (unchanged).

### 2. Enforce the new scope in the two RPCs that read it

- `search_active_employees_for_review`: when `scope='department'`, add `WHERE p.department_id = ANY(department_ids)`.
- `create_or_get_annual_review_instance`: same predicate on the write path (reject with `42501` otherwise).
- `can_proxy_submit_annual_review` / `can_access_annual_review_instance_for_assistance`: same predicate on the assist path (this closes the assist leak the previous plan described but never enforced at the search layer).

### 3. Backward-compatible payload

Add `department_ids: uuid[]` to the JSON. `useDirectoryAccess()` reads it into a new `departmentIds` field; existing consumers that only look at `businessUnitIds` keep working. `get_annual_review_access_explain` surfaces the resolved dept names so the admin "Scope viewer" shows "HOD → 1050 TPD-Process (dept-scoped)" instead of "HOD → 1050 TPD (BU)".

### 4. Verification (post-migration)

Re-run:

```sql
SELECT annual_review_directory_access('<Jyoti-uuid>');
-- expect: scope='department', department_ids=[TPD-Process], can_assist per role_capabilities

SELECT count(*) FROM search_active_employees_for_review('prabhat', '<cycle>', 50, 0)
  -- called as Jyoti; expect 0
```

Spot-check one HOD who also heads a BU (should still return BU scope) and one plain BU Head (unchanged).

## Risk & impact

- **Data**: additive column in resolver output; no schema changes to instances/responses.
- **Workflow**: HODs lose visibility of employees outside their own department in the directory. They keep full visibility of their own reporting subtree via existing manager path (rule 5).
- **UI**: no visual redesign — dialog copy already says "search across active employees you can review".
- **Regression risk**: BU Heads, HR team, Admin, plain managers — all branches untouched. Overrides still win first.
- **Rollback**: single `CREATE OR REPLACE` migration; reverting the function body restores current behavior instantly.

## Tests

- `src/test/annualReview/directoryAccessHodDeptScope.test.ts` — resolver returns `department` scope for pure HOD, `bu` for HOD+BU-Head, `bu` unchanged for BU Head only.
- Extend `src/test/annualReview/directoryAccess.test.ts` to lock the sibling-dept exclusion (Jyoti fixture cannot see Prabhat).

## Docs

- New **ADR-146 — HOD directory scope is department, not BU**.
- Update `mem/features/annual-review/directory-access.md` rule 4 and POLICY §AR-DIRECTORY-ACCESS-MATRIX to state HOD = own department(s) only.
