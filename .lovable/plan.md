

## Plan — Workflow Overrides Pagination + Search Fix + PMS Grade Defaults

### Goal
1. Add real pagination to **Employee Workflow Overrides** table (50/page), with search spanning all employees.
2. Fix the "search doesn't show all employees" bug — root cause: profiles query is silently capped at 1000 rows.
3. Hide the **PMS Grade column** in the Overrides table by default (toggle to show).
4. Hide the **PMS Grade filter** by default in all reviewer dashboards (Team / Manager / Skip-Level / HR PMS / Audit / Management) — surfaced via a "More filters" toggle so it neither loads options nor narrows results unless invoked.

### Root Cause — "Search not showing all employees"

`WorkflowConfig.tsx` line 143–153 fetches `profiles` with no `.range()`. PostgREST default cap = **1000 rows**. With ~2,533 active employees, ~1,500 are silently missing → search can never find them. v2.64.9 fixed this in `useProfilesByWorkflowStage`; the same pattern was missed here.

### UI Mockup — Workflow Overrides Table

```text
┌─ Employee Workflow Overrides ─────────────────────────────────────┐
│  Showing overrides for March 2026                                  │
│                                                                    │
│  [🔍 Search employees…              ]   [☐ Show PMS Grade column]  │
│                                                                    │
│  ┌─────────────────────┬────────┬──────────────────────┬────────┐  │
│  │ Employee            │ Code   │ Assigned Workflow    │ Action │  │
│  ├─────────────────────┼────────┼──────────────────────┼────────┤  │
│  │ Aakash Sharma       │ 100123 │ [Standard ▼]         │ 🗑     │  │
│  │ Aarav Mehta         │ 100124 │ [Inherit (default)▼] │        │  │
│  │ …                                                              │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  Showing 1–50 of 2,533 employees       [« Prev]  Page 1 of 51  [Next »] │
└────────────────────────────────────────────────────────────────────┘
```

When user types in the search box, the entire roster (all 2,533) is filtered, then paginated 50/page. Result count badge updates: `"23 matches found"`.

### UI Mockup — Reviewer Dashboard Filters (HR PMS / Audit / Management / etc.)

```text
Before:
[Search…] [Department ▼] [Designation ▼] [PMS Grade ▼] [Manager ▼] [Status ▼]

After:
[Search…] [Department ▼] [Designation ▼] [Manager ▼] [Status ▼]   [+ More filters ▾]
                                                                    └─► PMS Grade ▼   (only on click)
```

The PMS Grade dropdown:
- Is hidden behind "More filters" toggle.
- Its option list is only fetched the first time the user opens the toggle (lazy `enabled` flag on `useQuery`).
- Does not narrow other dropdowns (already true today; no change needed).
- When set, badge appears as today and is independently clearable.

### Files Touched

| File | Change |
|---|---|
| `src/pages/admin/WorkflowConfig.tsx` | (a) Profiles query: switch to `fetchAllPaged` so all employees load. (b) Add `currentPage` state + 50/page pagination using existing `Pagination` UI. (c) Search filters the FULL list before pagination. (d) Add `showPmsGradeColumn` toggle (default `false`); hide column + header + cell when off. (e) Replace `.slice(0, 50)` with proper paged slice. (f) Replace "Showing 50 of N" hint with full pagination footer (`Showing X–Y of Z`). |
| `src/components/review/EmployeeFilters.tsx` | (a) Remove PMS Grade from the default filter row. (b) Add a `Popover`-based "More filters" toggle (`[+ More filters]`) containing the PMS Grade `OrgFilterCombobox`. (c) When `selectedGrade` is set, the toggle button shows a count badge and the active-filter badge row still renders the chip. |
| `src/hooks/useEmployeeFilterOptions.ts` | Make the `distinct-grades` query lazy: accept `{ enabledGrades?: boolean }` option, gate `useQuery({ enabled: enabledGrades })`. Default `false` so dashboards don't pay the round-trip until the user opens "More filters". |
| `src/components/review/EmployeeSelectorGrid.tsx` | Wire local `gradesEnabled` boolean (set true once "More filters" opens), pass into `useEmployeeFilterOptions({ enabledGrades })`. No change to filter application logic. |
| `DOCUMENTATION.md` | Version History v2.64.10 — Workflow Overrides pagination + roster cap fix; PMS Grade hidden by default in Overrides table and reviewer dashboards. |
| `mem://features/admin/profile-based-menu-access` (append note) | Quick mention that admin tables querying `profiles` MUST use `fetchAllPaged` to bypass PostgREST's 1000-row cap. |

### Technical Details

- Reuse existing `Pagination` UI from `src/components/ui/pagination.tsx` (same pattern as v2.64.4 EmployeeSelectorGrid).
- Reuse existing `fetchAllPaged` helper from `src/lib/fetchAll.ts` (already used by `useEmployeeFilterOptions` for managers).
- `showPmsGradeColumn` state stored in component (not URL) — short-lived UI preference, no need to persist.
- "More filters" popover uses existing `Popover` + `OrgFilterCombobox` — no new components.
- Lazy-loading grades: `useQuery({ enabled: enabledGrades, ... })` — when `enabledGrades=false`, `data` stays `undefined`, dropdown shows "loading" the first time it's opened, then cached forever.

### Risk & Impact Report

| Area | Impact |
|---|---|
| Data | None — read-only changes |
| Workflow / RLS | None |
| Workflow Overrides table | Page can now find any of ~2,533 employees via search (regression fix). PMS Grade column hidden by default (toggle to show). Existing assignments unchanged. |
| Reviewer dashboards | PMS Grade filter dropdown moved into a "More filters" popover. Employees previously filtered by PMS Grade via URL param (`?grade=…`) still work — popover auto-opens if grade is preset. No change to filtering logic. |
| Performance | Removes one initial query on every dashboard load (grades). Workflow Overrides page does 3–4 paged fetches once instead of 1 capped fetch. Net improvement. |
| Regression risk | Low. Pagination component already battle-tested. Filter component changes are additive (existing props/behavior preserved). |
| Mitigation / test matrix | (a) Workflow Overrides → search "101178" → Sanjeeb appears. (b) Pagination shows correct counts and navigates. (c) "Show PMS Grade column" toggle works. (d) HR PMS / Audit / Management dashboards: PMS Grade filter no longer in the default row. (e) Click "More filters" → grade dropdown appears, fetches options once. (f) Select a grade → reviewer grid filters as before; chip appears in active filter row. (g) Refresh URL with `?grade=L4` → popover auto-opens, grade pre-selected. (h) Mobile (<640px): "More filters" expands inline below other filters. |

### Out of Scope
- Server-side pagination or search of profiles (client-side is sufficient at ~2.5K rows after the cap fix).
- Persisting "Show PMS Grade column" toggle across sessions.
- Changing Department/Designation/Manager filter behavior.
- Changing PMS Grade tab in WorkflowConfig (separate tab; unaffected).

