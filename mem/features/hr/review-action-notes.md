---
name: HR Review Action Notes
description: HR notes captured during PMS review for KPI changes — 3-state FSM (pending / in_progress / completed) with admin-configurable per-role visibility
type: feature
---

# HR Review Notes & Action Tracker

Lightweight log so HR can capture KPI/KRA-change inputs during reviews and track them to the next cycle.

## Storage
- Table `public.review_action_notes` (subject_employee_id, kpi_id?, period_id?, category, title, details, status, priority, assignee_id?, target_period_id?, created_by, completed_at/by).
- Column `applicable_from DATE NULL` (always day=1) — month when the captured change should take effect. Indexed (`idx_ran_applicable_from`).
- Visibility config in `system_settings` key `review_action_notes_visibility` (JSON: view/create/edit/delete/view_own_subject lists of roles).

## Access — DYNAMIC, never hardcoded in components
- All UI gates go through `useReviewNoteAccess()` (`src/hooks/useReviewNoteAccess.ts`).
- RLS uses SECURITY DEFINER `public.review_note_role_can(action, user_id)` which reads the JSON setting live.
- Admin is **always** included (defensive in both DB function and JS parser).
- Fallback if setting is missing/corrupt: only admin + hr_pms.
- Creator and assignee can always view + update their own row regardless of role config.

## Status FSM
- States: `pending` → `in_progress` → `completed`. No "WIP". Re-open allowed (status back to pending/in_progress).
- DB trigger `review_action_notes_stamp_completion` auto-stamps `completed_at`/`completed_by` on entry to completed and clears them on exit.

## Surfaces
- Page `/hr/review-notes` — tabs (Pending / In Progress / Completed / All) + filters; visibility-gated.
  - Header **+ Add Note** button (gated by `canCreate`) opens `<AddReviewNoteSheet />` with the **employee picker enabled** (no `subjectEmployeeId` prop).
  - Filters: Search, Employee, Category, Priority, Apply From (Any / This / Next month / Next quarter / Specific via `MonthPicker`).
  - "Employee" cell shows name + `employee_code` (muted line beneath).
  - "Apply From" column shows `MMM yyyy` or `—`.
  - Default sort: `applicable_from ASC NULLS LAST, updated_at DESC` (upcoming target cycles surface first).
- Admin page `/admin/review-notes-access` — switch matrix to edit the visibility config.
- Inline `<ReviewNoteTrigger />` (`src/components/reviewNotes/ReviewNoteTrigger.tsx`) — drop into any surface (scorecard row, profile header, KRA tile) with subject/kpi/period props. Renders nothing if `canCreate` is false.

## Pickers (reusable)
- `EmployeePickerCombobox` — Popover+Command over `useProfiles()` (active only). Searches name OR code OR email OR dept. Used in the sheet (when `subjectEmployeeId` not provided) AND as the hub Employee filter.
- `MonthPicker` — Popover+shadcn Calendar with `captionLayout="dropdown-buttons"`. Always emits `YYYY-MM-01`. Service helper `normaliseToFirstOfMonth()` snaps any value to day=1 server-side. `nextMonthFirstDay()` is the default for new notes.

## Files
- Service: `src/services/reviewNotes/reviewNotesService.ts`
- Hooks: `src/hooks/useReviewNotes.ts`, `src/hooks/useReviewNoteAccess.ts`
- Components: `src/components/reviewNotes/{AddReviewNoteSheet,ReviewNoteTrigger,ReviewNoteStatusPill,EmployeePickerCombobox,MonthPicker}.tsx`
- Tests: `src/test/reviewNotes/{access,statusFsm,employeePicker,applicableFrom}.test.ts`

## Out of scope
- No automatic mutations to KPIs/weightages — completing a note is a manual ack only.
- No analytics yet ("% of notes implemented next cycle").