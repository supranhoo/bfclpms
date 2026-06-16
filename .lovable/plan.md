## Goal

Improve the Annual Review Admin → Progress tab so admins can slice the 2,560-row grid by **Department**, **Business Unit**, and **Reporting Manager**, and use the screen width effectively.

## Problems (from screenshot)

1. Filters above the table are minimal (search + stage only). Department / BU / Manager are commonly asked for but missing.
2. The page is capped at `max-w-7xl mx-auto` so on a 1474px viewport ~25% of the width is dead space; the table itself only uses half the width.
3. Toolbar is split into two halves with a big gap; filters look disconnected from the action buttons.

## Risk & Impact

- **Data**: read-only. No schema, RLS, or migration changes.
- **Workflow**: no behavior change for any role beyond admins gaining filter capability.
- **Scalability**: filters apply server-side via the existing `listInstancesPaginated` (paged at ≤100). Department/BU resolved through `profiles → departments → business_units` using the same id-prefetch pattern as `search`. No full-table scans.
- **Regression**: low — additive args (`departmentId?`, `businessUnitId?`, `managerId?`) default to undefined, preserving current queries. Existing pagination/sort/export honored.
- **UI**: only the Progress tab toolbar + page container width change. Other tabs (Analytics / Calibration / Cycles / Templates / Rules) untouched.

## Plan

### 1. Service — `src/services/annualReview/annualReviewService.ts`
- Extend `ListInstancesPaginatedArgs` with optional `departmentId`, `businessUnitId`, `managerId`.
- In `listInstancesPaginated`:
  - `managerId` → direct `.eq('manager_id', …)` on the instance row.
  - `departmentId` / `businessUnitId` → resolve to a `profile_ids[]` list once (cap 2000, batched), then `.in('employee_id', ids)`. When combined with `search`, intersect the two id lists in-memory before the final query (no extra DB round-trip beyond the existing one).
- Mirror the same filters in `fetchAllInstancesForExport` so "Download data → Progress snapshot" honors the active filters (consistency rule).

### 2. UI — `src/pages/annual-review/AnnualReviewAdmin.tsx`
- Page container: change `max-w-7xl mx-auto` → `max-w-[1600px] mx-auto` (or `max-w-screen-2xl`) so the grid breathes on wide screens but stays readable on laptops. Keep `p-4 md:p-6`.
- Replace the ad-hoc toolbar with a single `Card` that contains:
  - Row 1: search input (flex-1, max ~360px) + Stage select + **Department** select + **Business Unit** select + **Manager** combobox + "Custom weights only" toggle.
  - Row 2 (right-aligned): Send reminders / Download data / Upload data (unchanged).
- Selects use existing hooks/data:
  - Departments → `useDepartments()` (already in `useSafetyOrg.ts`, reusable; or a thin new `useAllDepartments()` on `departments` table).
  - Business Units → `useBusinessUnits()` from same file.
  - Manager → searchable combobox sourced from `useActiveProfilesLite()` (paged hook already exists). Default closed; type-ahead.
- All three new filters reset `page` to 1 on change, mirror into `ProgressTab` local state (no URL params — matches current behavior).
- Show a small "Clear filters" link when any of dept/BU/manager/search is set.

### 3. Density
- Table wrapper: drop the fixed inner width assumption; let the table fill the new container (`w-full`). No column-width changes — only the parent grows.
- Pagination row keeps tabular-nums showing/of layout.

### 4. Tests — `src/test/annualReview/service.pagination.test.ts`
- Add cases:
  - `departmentId` triggers a `profiles` lookup and `.in('employee_id', …)`.
  - `managerId` adds `.eq('manager_id', …)` on instances (no profile lookup).
  - `businessUnitId` joins `departments → profiles` then `.in('employee_id', …)`.
  - Combining `search + departmentId` intersects ids and returns empty when disjoint.
- Existing 91 tests must continue to pass.

### 5. Docs
- `DOCUMENTATION.md`: note v2.66.35 — "Progress tab: department / BU / manager filters; widened admin container."
- `POLICY.md`: no policy change (no new permissions). Add one line under Admin Progress: "Filters are additive and server-side; export respects the active filter set."

## Out of scope

- No changes to row actions, dialogs, or stage logic.
- No URL persistence for filters (can be a follow-up if requested).
- No column re-ordering or new columns.

## Verification

- `bunx vitest run src/test/annualReview` — all green.
- Manual check on Progress tab: pick a department → row count and pagination update; combine with search and stage; "Download data → Progress snapshot" exports only filtered rows.
