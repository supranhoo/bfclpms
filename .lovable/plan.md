
# Re-parent existing departments to the new BUs

## Assumptions

- The uploaded `employees_export_2026-07-10.xlsx` (224 rows, Employees sheet) is authoritative for the new BU → Department mapping.
- No profile rows will be touched. Employees keep their `department_id`; only `departments.business_unit_id` changes, so every employee automatically moves under the correct new BU.
- No new departments and no new BUs will be created. Departments already exist with the required names.
- Rollback is a single UPDATE per row restoring the previous `business_unit_id` (captured in the migration).

## Risk & Impact Report

- **Data Impact**: 17 `UPDATE`s on `public.departments.business_unit_id`. No schema change, no delete, no insert. `profiles.department_id` untouched — the org tree just re-hangs at the BU level.
- **Workflow Impact**: Annual Review reviewer chain, BU-scoped access (HODs / BU Heads), reports filtered by BU, and dashboards that group by BU will start showing the new BU for the moved employees. This is the intended outcome.
- **UI/UX Impact**: Organization → Business Units tab will show non-zero dept/employee counts on the 15 new BUs; the old BUs (Commercial, Logistics, Sales And Marketing, BFCL, EHS) lose the moved departments. No UI code change.
- **Regression Risk**: Low. Foreign keys are intact. Two things to watch:
  1. `business_units.head_user_id` on the new BUs is still null → BU-Head resolver will re-compute on next access (auto). We are NOT setting heads in this pass.
  2. Any hard-coded BU-id filter in a saved report/dashboard would still point at the old BU. None found in code; verified via `rg`.
- **Mitigation**: Wrap all 17 updates in one transaction; capture pre-image (`old_business_unit_id`) in `system_audit_logs` per row for rollback; run a post-update sanity SELECT.
- **Scalability**: 17 rows. Negligible.

## Mapping (from uploaded master, reconciled against live DB)

```text
Dept (id)                                                → New BU                                          (id)
-------------------------------------------------------- ─────────────────────────────────────────────── ─────────
BFCL-BE                              (6181f85c…)         → BFCL-BE                                       (5cbdc8b1…)
BFCL-Costing & Business Analytics    (a4f98c64…, orphan) → BFCL-Costing & Business Analytics             (6c6b4ff4…)
BFCL-Infra                           (cce2eb8f…)         → BFCL-Infra                                    (0e576177…)
Commercial-Banking Finance           (52bb558c…)         → Banking Finance                               (1897f3e7…)
EHS-CSR                              (de11e503…)         → CSR                                           (ec44a278…)
Commercial-HO                        (fa1304fb…)         → Commercial-HO                                 (7e5d47dc…)
Commercial-Plant Accounts            (bdce986b…)         → Commercial-Plant                              (ff73b404…)
Commercial-Purchase                  (ba573c3a…)         → Commercial-Plant                              (ff73b404…)
Commercial-Stores                    (a437beb2…)         → Commercial-Plant                              (ff73b404…)
Commercial-HO Accounts               (ac4e5a39…)         → HO Accounts                                   (8a055937…)
Commercial-IT                        (8f691365…)         → IT                                            (9c54015f…)
Logistics-Port                       (8a986bef…)         → Logistics-Port                                (8f54666c…)
Logistics-Rake                       (1b0d6e6f…)         → Logistics-Rake                                (f283c35c…)
Logistics-Trailer                    (d9027355…)         → Logistics-Trailer                             (4ac31aac…)
Sales And Marketing-Export Ops       (43652d65…)         → Sales And Marketing-Export Operations         (2177f1ef…)
Sales And Marketing-Sales Ferro      (0b14100f…)         → Sales And Marketing-Sales Ferro Alloys        (d41c3547…)
Sales And Marketing-Sales Steel      (0e5ea4f4…)         → Sales And Marketing-Sales Steel               (be385832…)
```

Expected employees-per-new-BU after re-parent (from the uploaded active-employee counts):

```text
Commercial-Plant                       86    Commercial-HO                           8
Logistics-Trailer                      13    IT                                      9
EHS/Health/Environment/Safety*         35    HO Accounts                             9
Sales & Marketing (3 new BUs)          15    Logistics-Rake                         10
BFCL (3 new BUs)                       17    CSR                                     7
Logistics-Port                          2    Banking Finance                         4
```
*EHS split is not part of this pass — those depts stay under the existing EHS BU per the master.

## Step-by-step plan

1. **Snapshot pre-image** into `system_audit_logs` (event `org.department.reparent`) with `{ dept_id, old_bu_id, new_bu_id, source: 'employee-master-2026-07-10' }` per row.
   - Verification: `SELECT count(*) FROM system_audit_logs WHERE event='org.department.reparent'` returns 17.
2. **Apply 17 UPDATEs** on `public.departments` in one transaction, each guarded by `WHERE id = <dept_id> AND business_unit_id IS NOT DISTINCT FROM <expected_old_bu_id>` (fails safely if the row already moved).
   - Verification: `SELECT bu.name, COUNT(d.id) FROM business_units bu LEFT JOIN departments d ON d.business_unit_id = bu.id WHERE bu.created_at >= '2026-07-10' GROUP BY bu.name` — every new BU shows ≥ 1 dept.
3. **Recompute BU heads** for the 15 new BUs by calling `public.recalculate_bu_head(bu_id)` in the same migration. Head_source flips to `auto` and picks the top-of-hierarchy active employee within scope.
   - Verification: `SELECT id, name, head_user_id, head_source FROM business_units WHERE created_at >= '2026-07-10'` — heads populated where a candidate exists.
4. **Client cache invalidation** — none required; TanStack keys (`['business_units']`, `['departments']`, `['org-heads', …]`) refresh on next fetch. Users on the Organization page just need a page reload.

No UI code changes, no hooks, no components touched.

## SSOT sync (mandatory)

- `DOCUMENTATION.md` → Organization → add change-log entry: "2026-07-10 — Re-parented 17 departments to 15 new BUs using uploaded Employee Master; migration `<id>` includes per-row audit + rollback SQL."
- `POLICY.md` → no rule change (policies §AR-DIRECTORY-ACCESS-MATRIX / Org-Heads unchanged). Add a one-line note under Data Governance: department re-parenting is admin-only and must carry a per-row audit row.
- `mem/features/admin/multi-company-governance.md` → mention that BU/Dept restructures should re-parent existing departments (Option 2) rather than duplicate the tree when names collide.

## Tests

- New Vitest unit test `src/test/orgReparentPlan.test.ts` that asserts the exact 17-row mapping shape (guards against typos and future regressions if the plan is re-applied).
- Extend `orgHeadsSeederIntegration.test.ts` with a case: after moving a department to a new BU with no head, `resolve_bu_head` returns the top-of-hierarchy candidate from the moved department's employees.

## Rollback

Included in the migration file as a commented-out block:

```sql
-- Rollback: restore each dept's business_unit_id to the value stored in
-- system_audit_logs.payload.old_bu_id for event='org.department.reparent',
-- source='employee-master-2026-07-10'.
```

## Out of scope

- Creating any missing departments (none needed — the master's dept names all already exist).
- Renaming/merging BUs, deleting old BUs, or moving employees between departments.
- Setting BU heads manually — the `recalculate_bu_head` call in step 3 is sufficient.

Reply **approve** to switch to build mode and apply.
