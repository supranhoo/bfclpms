

# Restructure OrgKpiEntryCard to Two-Column Layout (like KPI Review Panel)

## Problem

Currently each OrgKpiEntryCard stacks all content vertically -- header, meta, inputs, actions -- taking up a lot of vertical space and causing width issues with long KPI names. Users must scroll extensively to see all KPIs on the page.

## Before

```text
+------------------------------------------------------------------+
| KPI Name (long text, truncated)                    [Status Badge] |
| Scope: Org | Target: 100 | UOM: % | Prev: 90                    |
| [Achieved: ____]  [Remark: __________]  [Upload]                 |
| [History] [Impact]              [Saving...] [Save] [Propagate]   |
+------------------------------------------------------------------+
```

Each card is full-width, stacked vertically (4 rows). Long KPI names push widths. All info takes lots of vertical space.

## After

```text
+------------------------------------------------------------------+
| LEFT (40%)                      | RIGHT (60%)                    |
| KPI: Annual Medical Exam        | Achieved: [______]             |
| KRA: Statutory Compliance       | Remark:   [______________]    |
| Scope: Org | Target: 0 | UOM: # | [Upload File]                 |
| Prev: 0 (Jan 2026)             |                                |
| Status: [Pending]               | [History] [Impact]  [Save] [P] |
+---------------------------------+--------------------------------+
```

Two-column grid (2:3 ratio like KpiReviewPanel) keeps info and inputs side-by-side. On mobile, it collapses to single column. This shows more cards per page and prevents horizontal overflow.

## Changes

### File: `src/components/admin/OrgKpiEntryCard.tsx`

Restructure the card body from vertical stack to a `grid grid-cols-1 md:grid-cols-5` layout:

- **Left column (md:col-span-2)**: KPI name (with `whitespace-pre-wrap` and `break-words` instead of truncate so full name is visible), KRA name, scope/target/UOM meta badges, previous period value, status badge
- **Right column (md:col-span-3)**: Input fields (achieved, remark, upload) stacked vertically, action buttons row (history, impact, save, propagate) with save status

For department/employee-scoped cards, the scoped entry table spans full width below both columns.

### File: `src/components/admin/OrgKpiScopedEntryTable.tsx`

Add `min-w-0 overflow-x-auto` to the table container to prevent scoped tables from causing overflow.

### File: `DOCUMENTATION.md`

Update to document the two-column card layout pattern.

## Technical Details

| File | Change |
|---|---|
| `src/components/admin/OrgKpiEntryCard.tsx` | Restructure to `grid grid-cols-1 md:grid-cols-5` two-column layout; left = info, right = inputs + actions |
| `src/components/admin/OrgKpiScopedEntryTable.tsx` | Add `overflow-x-auto` to table wrapper |
| `DOCUMENTATION.md` | Document two-column card pattern |

No logic, data, or database changes -- only layout restructuring following the existing `KpiReviewPanel` pattern.

