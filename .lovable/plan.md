# Fix: Workflow Configuration Report exports blank rows

## What is wrong

The exported workbook has a correct header line ("Templates: 15 | Total Overrides: 397") but every employee row prints "—" for Name, Code, Email, PMS Grade, Department, Reporting Manager and Skip-Level Manager.

## What was verified in the database

- `workflow_config` holds exactly 397 employee override rows.
- All 397 `config_value` entries are valid `profiles.id` values (397/397 join cleanly).
- The employee directory itself is intact (2,672 profiles, 2,584 active).

So the stored data is correct. The blanks are produced on the browser side, when the export builds its lookup map of employees.

## Diagnosis (one confirmed defect, one contributing risk)

The export does not fetch employee data itself. It reuses whatever the Workflow Config screen happens to have loaded and passes `profiles || []`. That creates two failure paths, and the plan closes both rather than guessing which one this user hit:

1. **Timing** — the Export button is enabled immediately, while the ~2,600-employee profile fetch (3 paged round trips) is still in flight. Clicking early yields an empty lookup map, so every lookup falls through to "—" while the template and override counts (already loaded) still print correctly. This matches the exported file exactly.
2. **Visibility** — that screen reads the `profiles` table directly, so row-level access rules can return a partial roster for non-admin exporters, silently blanking a subset of rows.

A third, smaller correctness bug found while reading the code: the "All Employees (Resolved)" sheet hardcodes `is_active: true` for every person, so deactivated employees can be printed as valid reviewers.

## The fix

**1. Make the export self-sufficient.** On click, the export fetches the roster itself through the existing secure `get_reviewer_roster_slim` service (paged, bypasses per-row access cost, already used by the rest of the app) instead of depending on the screen's state. It returns exactly the fields the report needs, including active status.

**2. Never ship a silently blank file.** If the roster comes back empty, the export aborts with a clear error message instead of writing a workbook full of dashes. If some individual employees still cannot be resolved, those cells read `Unresolved (id: 30ec1688…)` rather than "—", and a warning line is added under the report header stating how many rows could not be resolved.

**3. Loading state.** The button shows "Preparing…" and stays disabled for the whole fetch-and-build cycle, so an early click can no longer produce a partial file.

**4. Correct active status.** Feed the real `is_active` value into the reviewer-chain resolver and add an "Employee Status" column, so inactive people resolve as N/A instead of appearing to be live reviewers.

**5. Same treatment for every sheet.** Employee Overrides, PMS Grade Assignments and All Employees (Resolved) all read from the freshly fetched roster, so the sheets can no longer disagree with each other.

## Technical detail

- `src/components/admin/WorkflowConfigExport.tsx`: replace the `profiles` prop dependency with an on-click `fetchAllRpcPaged(get_reviewer_roster_slim)` call; add the abort guard, unresolved-count warning row, busy label and status column.
- New `src/lib/reports/workflowConfigExportRows.ts`: pure row builders (`buildEmployeeOverrideRows`, `buildResolvedEmployeeRows`, `unresolvedCount`) so the blank-row regression is unit-testable without a browser.
- `src/pages/admin/WorkflowConfig.tsx`: stop passing `profiles`; keep passing templates, configs and departments.
- `src/test/reports/workflowConfigExport.test.ts`: cases for full resolution, missing profile → `Unresolved (id: …)` marker, empty roster → abort signal, inactive employee → N/A in the resolved chain, and skip-level manager derivation.
- Docs: ADR-214, `POLICY.md` §WF-CONFIG-EXPORT-SELF-SUFFICIENT (exports must fetch their own data and must fail loudly rather than emit placeholder-only rows), `DOCUMENTATION.md` v2.69.

## Risk

Frontend and export-only; no schema change, no change to how workflows resolve during live reviews. Rollback is reverting the component. The export will take a moment longer because it now fetches its own roster — that is the trade for correctness, and the button communicates it.
