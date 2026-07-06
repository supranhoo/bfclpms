## Goal
In the "Templates in use" card on `/annual-review/admin/mapping`, let admins click a template row to open a dialog listing every employee mapped to that template (name, department, grade, designation), with a per-row "Remove" action.

## UX

- Each row in `TemplatesUsagePanel` becomes clickable (and gets a small "View employees" button on hover / always-visible on the right, next to the count badge).
- Clicking opens a `Dialog` titled `"<Template name> — mapped employees (N)"`.
- Body: search box + scrollable `Table` with columns **Code · Name · Department · Designation · Grade**, plus a trailing **Actions** column with a "Remove" button per row.
- Footer: close button, and a note explaining what "Remove" does (see below).
- If the template has 0 mapped employees, dialog shows an empty-state instead of the table.

## "Remove" semantics (important — surfaced in the dialog)

Employees land on a template through one of two paths, so removal branches:

1. **Manually pinned (`hasOverride === true`)** — Remove calls `svc.setTemplateOverride({ instanceId, templateId: null, reason })`. That clears the pin and the employee falls back to rule resolution (may re-land on the same template if a rule still matches).
2. **Rule-resolved (no override)** — Remove pins the employee with `templateId: null` and reason "Removed from <template>" so they become explicitly unmapped for this cycle. The admin can then map them elsewhere via the audience builder or per-employee panel.

Removal requires a seeded `annual_review_instances` row (same guard the override panel already uses). If missing, the button is disabled with a tooltip "Seed the cycle first." A short reason prompt (min 3 chars, same pattern as override) is required — implemented as a small inline confirm using the existing `ConfirmDestructiveDialog` plus a textarea, or a lightweight inline prompt row that expands on click.

## Data

All the required fields are already loaded by `checkMappingCoverage` — `report.rows[].employee` has `full_name, employee_code, designation, pms_grade, department_id`. Only **department name** needs resolution:

- Add a small `useQuery(['departments','id-name-map'])` that pages `departments(id, name)` via `fetchAllPaged` and returns a `Map<string,string>`. Reused inside the dialog and available for future callers.

Instance IDs for the "Remove" action: reuse the same on-demand lookup pattern from `EmployeeOverridePanel` (single-row `annual_review_instances` fetch keyed by cycle + employee), but batched — one `.in('employee_id', [...])` query for the dialog's roster, cached under `['annual-review','form-mapping','instances',cycleId, templateId]`. Refetched on dialog open.

On successful removal: invalidate the coverage query so counts + the mapped list update immediately; toast success.

## Files

1. **`src/pages/annual-review/AnnualReviewFormMapping.tsx`**
   - Make each row in `TemplatesUsagePanel` a button that opens a new `TemplateEmployeesDialog`.
   - Add the new `TemplateEmployeesDialog` component (in the same file, matching the file's existing "one page, colocated subcomponents" style).
   - Thread `report`, `cycleId`, and an `onChanged` callback into the panel so the dialog can trigger `coverageQ.refetch()`.

2. **`src/services/annualReview/formMapping.ts`** *(no schema change)*
   - Export a small helper `fetchDepartmentNameMap()` (paged) so the dialog and any future consumers share one loader. Uses existing `fetchAllPaged` pattern.

3. **Tests — `src/services/annualReview/formMapping.test.ts`** (extend existing file)
   - `fetchDepartmentNameMap` returns a Map for the mocked rows.
   - Remove-flow contract: `setTemplateOverride` called with `templateId: null` and the entered reason.

## Risk & Impact

- **Data**: read-only for the roster; write path reuses existing `setTemplateOverride` service and its audit log — no new tables, no new RPCs.
- **Workflow**: rule-resolved "Remove" creates a NULL-template override, which shows up as `Unmapped` in the banner. Dialog copy calls this out so admins aren't surprised.
- **UI/UX**: template rows become interactive — keep the count badge visible; add a subtle chevron / "View" affordance so it's obvious they're clickable.
- **Regression**: no changes to seeding, rules, or existing override panel logic.
- **Scale**: largest template today has ~2054 employees. Dialog uses a virtualised-friendly scroll container (`max-h-[60vh] overflow-auto`) and client-side search over the already-loaded `report.rows` — no extra network cost for opening the dialog beyond the one departments + one instances query.

## Not Applicable
Docs/policy updates: this is a UI addition on top of existing services; no policy change. DOCUMENTATION.md changelog line will be added noting the new admin affordance.
