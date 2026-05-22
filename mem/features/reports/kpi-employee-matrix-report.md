---
name: KPI Employee Matrix Report
description: Weightage/score pivot, scale pagination, hierarchical filtering, compact sticky-grid layout
type: feature
---
The 'KPI-Employee Score Matrix' (/reports/kpi-employee-matrix) provides a cross-tab pivot report with KRA/KPI names as rows and Employees as columns. Cells display the assigned Weightage % as the primary bold value, with the calculated Weighted Score (using the 8-stage fallback chain) as smaller secondary text. To handle scale, the report implements mandatory Business Unit and Department filtering and pagination for the on-screen table. Organizational filters (Company -> Business Unit -> Department) utilize a cascading reset logic. A full-matrix Excel export is available, providing both the weightage and score metrics. Access is governed by the 'kpi-employee-matrix' menu key and role-based defaults in the 'report_access_config' table.

Layout invariants (single source of truth in `COL` constants):
- `COL.kpi = 180` — compact left pane (dashboard parity). KPI cell shows KPI name only by default; per-row chevron toggles KRA · Wt% as a muted second line, and a global "Show KRA · Wt%" switch expands all rows at once. Hover tooltip always exposes KRA, Category, and Base Weightage so no info is lost when collapsed.
- Sticky z-index discipline: thead `z-30`, header intersection cells (Sr + KPI) `z-40`, body sticky cells `z-20`, category band `z-20`. Prevents body cells from painting over the header during fast scroll.
- Category band rows are sticky on both axes: `sticky left-0` plus `top: COL.headerH`, so the category label stays anchored at the top of the scroll container as KPI rows scroll vertically, and remains visible during horizontal employee scroll.
- Sticky KPI column uses a soft right-edge shadow (`shadow-[4px_0_8px_-4px_hsl(var(--foreground)/0.12)]`) as the freeze line.
- Score cells use `tabular-nums` for column-aligned digits.
