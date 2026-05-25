## 1. Assumptions
- The visible error `relation "public.org_kpis" does not exist` is coming from the live `public.kpi_cell_detail(uuid, uuid)` RPC used by the Bulk Scoring drawer.
- The correct existing source table is `public.org_kpi_values`, not `public.org_kpis`.
- The previous category fix should remain intact so the drawer can show the real KPI category instead of `Uncategorized`.

## 2. Clarifications
- Not Applicable — the root cause is clear from the live function definition and schema check.

## 3. Risk & Impact Report
- **Data Impact:** No data changes. Only the RPC definition will be corrected to read the existing `org_kpi_values` table.
- **Workflow Impact:** Bulk Scoring detail drawer should open again; write-as-Manager should no longer be blocked by the missing relation. No approval/status advancement logic changes.
- **UI/UX Impact:** The current red error banner in the drawer should disappear. Category visibility remains preserved through the embedded `kra_categories` payload.
- **Regression Risk:** Moderate, because this RPC is shared by the scoring drawer and detail panel. Mitigation is to preserve the full current function shape and change only the bad table reference.
- **Scalability Impact:** No new broad dataset loads. Existing history remains capped at 6 rows; org KPI lookup remains a single keyed lookup by KRA/KPI/period/year.
- **Security/RLS Impact:** No new table or policy. RPC remains guarded by the existing role checks and uses the already-existing org KPI value source.
- **Backup/Data Integrity:** No table is added or excluded; backup coverage remains unchanged.

## 4. Step-by-step Plan
1. Create a database migration that replaces `public.kpi_cell_detail(uuid, uuid)` with the current safe function body, changing only the org KPI lookup from `public.org_kpis` to `public.org_kpi_values`.
2. Preserve the previous fixes:
   - `kra_categories` is embedded in the KPI JSON.
   - Workflow uses `public.get_employee_workflow(...)`, not the missing `resolve_employee_workflow(...)` call.
   - Workflow resolution stays wrapped in exception handling so the drawer does not fail if workflow lookup has a separate issue.
3. Add a regression contract test that checks the latest `kpi_cell_detail` migration:
   - does not reference `public.org_kpis`,
   - does reference `public.org_kpi_values`,
   - uses `get_employee_workflow`,
   - includes `kra_categories` enrichment.
4. Update `DOCUMENTATION.md` version history with the RCA and fix.
5. Update `POLICY.md` to pin the Bulk Scoring detail RPC contract: organization KPI detail data must use `org_kpi_values`, and category display must come from `kpis.category_id -> kra_categories`.
6. Verify after migration with read-only checks:
   - `public.org_kpis` is absent and `public.org_kpi_values` exists,
   - live `kpi_cell_detail` definition no longer contains `public.org_kpis`,
   - the drawer RPC can execute without the missing relation error.

## 5. UI Changes
- **Visual change:** Remove the red backend error from the Bulk Scoring drawer by fixing its data source.
- **Location:** `/review/bulk-scoring`, KPI detail/write-as-Manager side drawer.
- **Interaction impact:** Opening a KPI detail and saving Manager score should no longer be prevented by the missing relation.
- **Responsiveness:** Not Applicable — no layout or responsive behavior changes.

## 6. Implementation
- Use one SQL migration to replace only the faulty RPC definition.
- Do not create a new `org_kpis` table, because that would duplicate the existing master source and risk data drift.

## 7. Tests
- Add a focused static regression test for the RPC migration contract.
- Run the relevant test target after implementation if available.

## 8. DOCUMENTATION.md updates
- Add a new top version note documenting: root cause, affected drawer, corrected table, preserved category/workflow fixes, and no scoring/workflow-policy change.

## 9. POLICY.md updates
- Add/extend the Bulk Scoring/Org KPI policy note so future migrations cannot reintroduce `org_kpis`.

## 10. Post-implementation notes
- Rollback strategy: restore the prior `kpi_cell_detail` function definition from migration history if needed, though the prior definition is known to contain the missing-table bug.
- Troubleshooting reference: https://docs.lovable.dev/tips-tricks/troubleshooting