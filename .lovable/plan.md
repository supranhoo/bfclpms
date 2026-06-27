## Observation
In the highlighted region of the Audit Panel:
- The "Auditor Workload" header + chip strip occupies only the left portion of the row, leaving a large empty band on the right.
- The Employees `Active / Inactive / All` toggle sits on its own dedicated row, right-aligned, creating an extra vertical gap before the filter row.
- (Note: the user said "west", but the empty band is on the east/right of the chips — confirming below.)

## Proposed Change (UI only, no logic)
1. Promote the "Auditor Workload" header into a flex row: header on the left, `EmployeeStatusFilter` pinned to the right of the same row (audit view, full-access only). This consumes the empty right-side space.
2. Remove the separate `<div className="flex items-center justify-end">` wrapper row for `EmployeeStatusFilter` when audit view is showing the workload header. Keep the standalone row as a fallback for non-audit views (so management / hr_pms / skip_level layouts are unchanged).
3. Reduce vertical gap: the workload `space-y-2` wrapper and the now-removed status row collapse one row of whitespace.
4. Keep the chip strip below the header exactly as-is (still `overflow-x-auto`, no chip restyling).

## Scope guardrails
- Only `src/components/review/EmployeeSelectorGrid.tsx` lines ~2139–2243 touched.
- No changes to `EmployeeStatusFilter`, `EmployeeFilters`, data hooks, RPCs, or behavior.
- No token changes; uses existing flex utilities.
- Non-audit views render identically (status toggle stays where it is today).

## Risk & Impact
- Data: none. Workflow: none. Regression risk: low — purely JSX rearrangement inside one conditional block.
- Responsive: on narrow widths the header row wraps (`flex-wrap`) so the toggle drops below the title instead of overlapping chips.
- Rollback: revert the one file.

## Tests
- Add a lightweight render test `src/test/auditPanelToolbarLayout.test.tsx` asserting that in audit view the status filter and workload header share a single flex row container (className contract), mirroring the pattern in `orgTabsListLayout.test.tsx`.

## Docs
- `DOCUMENTATION.md` v2.66.59 note under Audit Panel UI: "Employees status filter inlined with Auditor Workload header to remove dead horizontal space."
- No `POLICY.md` change (presentation only).

Used the ui-ux-pro-max skill (Quick Ref §5 layout density, §6 whitespace-balance).