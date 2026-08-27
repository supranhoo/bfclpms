# Yes — your check is correct. The KPI names were never changed.

## What I verified in the live database

- Today (27 Aug 2026, 11:40 UTC) the standardization log recorded **119 `create_definition`** and **120 `link_alias`** actions.
- The log contains **zero `rename_kpis` actions — ever**. That is the only action that rewrites `kpis.kpi_name` / `kra_name`.
- `kpi_definition_links` is **empty (0 rows)**; only 3,553 of 18,020 FY2026 KPI rows carry a `kpi_definition_id`.
- FY2026 still has **1,406 distinct KPI name strings**.
- The KPI-Employee Matrix report reads raw `kpi_name` / `kra_name` from `kpis` (via `rpc_kpi_employee_matrix_rows`), and groups rows by `kra_name|kpi_name`. It never consults the registry or aliases.

So the work you did built the canonical registry and mapped variant names to it — a metadata layer. It deliberately did not touch employee KPI rows, which is why the export looks identical.

## Second issue found

`correct_may_kpis` (the rename action) only rewrites **one category + one KRA + one KPI + one single month** per call. Even used correctly, it cannot standardise a name across Jul 2026 → Jun 2027 in one go. That is why manual correction feels like it "doesn't stick" beyond the month you were on.

## Proposed fix

1. **Make the registry visible in the report (no data rewrite).**
   Add a resolved "Canonical KPI" name to the matrix rows, resolved through the alias table, and collapse variants onto one row. Toggle in the report header: *Show as entered* / *Show canonical*. The export follows the toggle. Zero risk to scores.

2. **Add a real multi-month rename action.**
   New RPC `correct_kpis_range(old → new, from period/year, to period/year)`: same forward-only guard (May 2026+), same before-image capture so History & Undo can reverse the whole run as one action, applied to `kpis` and `org_kpi_values`. Dry-run preview showing rows per month and any rows skipped because they are locked or approved.

3. **Bulk "Apply registry" from Review Registry.**
   For each definition with linked aliases, one button that queues the range rename for every variant onto the canonical name, with a preview of the total row count before commit. Currently there is no path from a linked alias to an actual correction — that is the missing bridge.

4. **Health & Coverage honesty.**
   Show two separate numbers: *names linked to registry* and *rows actually renamed*. Today only the first is shown, which is what made this look done.

## Guarantees

- Nothing before May 2026 is touched — the existing frozen-history guard stays.
- Renames change text and definition binding only. Targets, weightages, scores, ratings, and workflow status are untouched.
- Every run is one reversible entry in History & Undo.

## Technical notes

- Files: `src/hooks/useKpiRegistry.ts`, `ReviewRegistryTab.tsx`, `CorrectMayKpisTab.tsx`, `HealthCoverageTab.tsx`, `src/hooks/useKpiEmployeeMatrix.ts`, matrix report page/export.
- Server: new `correct_kpis_range`, `correct_kpis_range_dry_run`, alias-resolution view for the matrix; `reverse_standardization_action` extended for the new action type.
- Tests: range guard rejects pre-May-2026, undo restores exact before-image, matrix canonical grouping, alias resolution with no alias present.
- Docs: ADR-330 plus DOCUMENTATION.md and POLICY.md (§KPI-STANDARDIZATION-APPLY).

## Rollback

Additive only. The report toggle defaults to *Show as entered*; the range rename is reversible per run.
