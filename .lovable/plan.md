# Fix "Employees impacted" stat in Performance Console

## Problem
The tile shows 2744 for August 2026. That is the sum of every KPI's mapped-employee count, so an employee mapped to 20 KPIs is counted 20 times. The real number of distinct employees in scope for August 2026 is 181.

## Root cause
`computeConsoleStats` in the stat band adds `kpi.employee_count` across all KPIs of all KRAs. The console tree payload carries only per-KPI counts, never a distinct employee total, so a correct number cannot be derived on the client.

## Fix
1. Extend the `bu_console_tree` RPC to also return a scope-level `employee_total` — `count(distinct employee_id)` over the same filtered KPI set the tree is built from (same period/year, division, business unit, department, manager filters). Purely additive, no signature change beyond one extra JSON key.
2. Add `employee_total` to the `BuConsoleTree` type in `src/hooks/useBuConsole.ts`.
3. Change `computeConsoleStats` to take the distinct total from the tree instead of summing per-KPI counts; keep the summed value out of the tile entirely.
4. Relabel the tile context so the meaning is unambiguous: "Employees impacted" with sub-text "distinct employees in scope".
5. Leave per-KRA / per-KPI "N employees mapped" text untouched — those are correctly per-node counts.

## Verification
- Load console for August 2026 with no filters: tile must read 181.
- Apply a business-unit filter: tile must drop and still match `count(distinct employee_id)` for that scope.
- Update `src/components/admin/bu-console/consoleLayout.test.tsx` so the stats test asserts the distinct total is passed through rather than summed.

## Docs
Add ADR-281 (distinct employee scope count) and note the rule in DOCUMENTATION.md: scope-level people counts are always distinct, never row sums.
