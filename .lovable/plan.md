# Remove "N values" weightage badge from Performance Console tree

## What the user is pointing at

In the BU Performance Console tree, the Weightage column shows **"2 values" / "3 values"** whenever the employees behind one KPI row carry different weightages (`BuConsoleTree.tsx` ~line 245: `${weights.length} values`). The user says this should not be displayed on the tree row because the per-employee weightages are already visible under **Open** (the expanded people panel).

## Change (small, display-only)

**File: `src/components/admin/bu-console/BuConsoleTree.tsx`** — `KpiRow` Weightage metric:

- One weightage value → keep showing the number (e.g. `5.00`).
- Zero values → keep `—`.
- Multiple differing values → show `—` instead of `N values`. The exact per-employee weightages remain available in the expanded row ("Open" panel), which already renders them.

No data, scoring, or API changes — `weightage_values` stays in the payload and is untouched.

## Tests

- `src/components/admin/bu-console/consoleLayout.test.tsx` — update the case at ~line 144–148 that asserts `3 values` is rendered; it should now assert the column shows `—` for a weightage spread while remaining silent for single-definition rows.
- Re-run the bu-console test suite (`consoleLayout.test.tsx`, `kpiVariants.test.ts`, `buConsoleModuleBindings.test.ts`).

## Docs

- ADR entry + version note in `DOCUMENTATION.md` (Performance Console tree weightage display rule).
- `POLICY.md` — note that per-employee weightage variance is a drill-down detail, not a tree-level badge.

## Risk & impact

- **Data:** none — pure presentation.
- **Workflow:** users relying on "N values" as a hint of variance lose the hint; mitigation is the existing "N variants / Align" badges (which flag *definition* drift) and the Open panel showing each weightage.
- **Regression risk:** low; one component and one test file touched.
- **Rollback:** single-line revert.
