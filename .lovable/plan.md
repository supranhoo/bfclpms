# Plan: Employee Picker + "Applicable From" Month in HR Review Notes

## Problem
Two gaps on `/hr/review-notes`:
1. Notes can only be created via the inline trigger on a scorecard / profile — HR wants to add a note **directly from the hub** and pick the employee (with **employee code** for unambiguous mapping).
2. Each note needs an **"Applicable From"** month so HR knows *when* the change should take effect (e.g. "apply from Jul-2026 cycle"), and so the list can be filtered/sorted by that target month.

## Scope

### 1. New "+ Add Note" button on the hub header
Top-right of the HR Review Notes card. Visible only when `useReviewNoteAccess().canCreate` is true (no hardcoded role check — same gate as the inline trigger).

### 2. Employee picker inside `AddReviewNoteSheet`
When the sheet opens **without** a `subjectEmployeeId` prop (opened from the hub), render a searchable employee combobox at the top of the form. When opened **with** a prop (existing inline use), the picker is hidden — zero regression.

Picker behaviour:
- Search by **name OR employee code OR email** (case-insensitive substring).
- Each row shows: `{full_name}  ·  {employee_code}  ·  {department or designation}` to disambiguate same-name employees.
- Only active employees (`is_active = true`).
- Required before "Save Note" enables.
- Built on existing shadcn `Command` + `Popover` primitives — no new deps.

### 3. New "Applicable From" month field
A month-picker on the Add/Edit sheet, stored as a `DATE` (always the 1st of the chosen month, e.g. `2026-07-01`).

- **Input UI:** shadcn `Popover` + `Calendar` configured with month-only navigation; defaults to **next month** so HR rarely has to change it.
- **Optional but encouraged** — leaving it blank means "no specific target cycle".
- Visible by default (between Priority and Save).

### 4. Show "Applicable From" in the table
- New column **"Apply From"** between *Priority* and *Updated*, formatted `MMM yyyy` (e.g. `Jul 2026`). Shows `—` when blank.
- New filter on the hub: **Apply From** dropdown with quick options:
  - *Any*, *This month*, *Next month*, *Next quarter*, *Specific month…* (opens month-picker).
- Default sort: `applicable_from ASC NULLS LAST, updated_at DESC` so upcoming-cycle items rise to the top.

### 5. Employee filter on the hub
A filter next to Category / Priority: **Employee** combobox (reuses the same picker component). Adds `subject_employee_id` to `ListFilters`.

### 6. Show employee code in the table
Update the "Employee" column to show name on top and `employee_code` muted below.

## UI Sketch (hub, 1280px)

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ HR Review Notes & Action Tracker                       [ + Add Note ]      │
│ Capture KPI / KRA change inputs during PMS review…                         │
│                                                                            │
│ [Pending (3)] [In Progress (1)] [Completed (12)] [All (16)]                │
│                                                                            │
│ [🔍 Search…  ] [Employee ▾] [Category ▾] [Priority ▾] [Apply From ▾]       │
│                                                                            │
│ ┌────────────────┬──────────┬────────────────┬───────┬──────────┬────────┐ │
│ │ Employee       │ Category │ Title          │ Prio. │ Apply    │ Status │ │
│ │                │          │                │       │ From     │        │ │
│ ├────────────────┼──────────┼────────────────┼───────┼──────────┼────────┤ │
│ │ Aarav Sharma   │ KPI      │ Reduce target  │ High  │ Jul 2026 │ Pend.  │ │
│ │ EMP-0421       │ change   │                │       │          │        │ │
│ │ Riya Patel     │ Weight   │ Drop safety 5% │ Med   │ —        │ WIP    │ │
│ │ EMP-0588       │ change   │                │       │          │        │ │
│ └────────────────┴──────────┴────────────────┴───────┴──────────┴────────┘ │
└────────────────────────────────────────────────────────────────────────────┘
```

## UI Sketch (Add Note sheet, opened from hub)

```text
┌─────────────────────────────────┐
│ Add Review Note              ✕  │
├─────────────────────────────────┤
│ Employee *                      │
│ [ Search name or code…       ▾] │
│   ┌─────────────────────────┐   │
│   │ Aarav Sharma · EMP-0421 │   │
│   │ Production              │   │
│   ├─────────────────────────┤   │
│   │ Aarav Singh · EMP-0588  │   │
│   │ Quality                 │   │
│   └─────────────────────────┘   │
│                                 │
│ Category   [ KPI change      ▾] │
│ Title *    [ ……………………………… ]   │
│ Details    [ …multi-line……… ]   │
│ Priority   [ Medium          ▾] │
│                                 │
│ Apply From (cycle month)        │
│ [ 📅  Jul 2026              ▾]  │
│   defaults to next month        │
│                                 │
│         [ Cancel ] [ Save Note ]│
└─────────────────────────────────┘
```

## Technical Details

**DB change (single migration)**
```sql
ALTER TABLE public.review_action_notes
  ADD COLUMN applicable_from DATE NULL;
COMMENT ON COLUMN public.review_action_notes.applicable_from
  IS 'Month (always day=1) when the captured change should take effect.';
CREATE INDEX idx_ran_applicable_from
  ON public.review_action_notes(applicable_from);
```
- Nullable, no default (existing rows stay `NULL`). No RLS change needed — same row, same policies.

**Files to edit**
- `src/services/reviewNotes/reviewNotesService.ts` — add `applicable_from?: string | null` to `ReviewActionNote`, `ReviewActionNoteInput`, and `ListFilters`. Apply `.eq('subject_employee_id', …)`, `.gte/lte('applicable_from', …)` when set; default ordering becomes `applicable_from ASC NULLS LAST, updated_at DESC`.
- `src/components/reviewNotes/AddReviewNoteSheet.tsx` — make `subjectEmployeeId` optional; add `EmployeePickerCombobox`; add month-picker; submit `applicable_from` as `YYYY-MM-01`.
- `src/pages/hr/ReviewNotes.tsx` — header "+ Add Note" button, Employee + Apply-From filters, new "Apply From" column, employee-code line in cell.
- `src/integrations/supabase/types.ts` — auto-regenerated.

**Files to create**
- `src/components/reviewNotes/EmployeePickerCombobox.tsx` — reusable Popover+Command picker over `useProfiles()`, filters out inactive, searches name/code/email.
- `src/components/reviewNotes/MonthPicker.tsx` — thin wrapper around shadcn `Calendar` (`captionLayout="dropdown"`, snaps selection to first of month) + `Popover`. `pointer-events-auto` per shadcn rule.
- `src/test/reviewNotes/employeePicker.test.ts` — search by code, by name, hides inactive, returns id.
- `src/test/reviewNotes/applicableFrom.test.ts` — value normalises to day=1; default = next month; null filter excluded; sort orders nulls last.

## Risk & Impact Report
- **Data Impact:** Additive nullable column + index. No back-fill, no RLS change, existing rows unaffected.
- **Workflow Impact:** Additive. No automation acts on `applicable_from` — it is informational and used for filter/sort only (consistent with the original "no automatic mutations" scope).
- **UI/UX Consistency:** Reuses existing shadcn `Command`/`Popover`/`Calendar` patterns; matches other pickers in the app.
- **Regression Risk:** Low. Inline trigger keeps passing `subjectEmployeeId` so its branch is unchanged. Default ordering change is the only behavioural shift for existing notes — mitigated because nulls go last, so old rows stay visible exactly where they are today.
- **Mitigation:** Unit tests above; manual QA paths below.

## QA checklist after build
1. Hub → "+ Add Note" → search by code "EMP-0421" → pick Jul 2026 → save → row appears with name+code and `Jul 2026`.
2. Inline trigger on a scorecard → sheet opens with employee locked (no picker) and Apply-From defaulted to next month → save still works.
3. Apply-From filter → "Next quarter" shows only Jul/Aug/Sep 2026 rows; "Any" restores full list.
4. Employee filter → only chosen person's notes show.
5. Inactive employees absent from both pickers.
6. Existing notes (created before migration) show `—` in Apply From and remain editable.
7. Non-creator role does not see "+ Add Note".
8. Memory file `mem://features/hr/review-action-notes` updated with the new column + picker behaviour.

---

Reply **approve** to implement, or tell me to drop/adjust any piece (e.g. skip the Apply-From quick filters, hide the column on mobile, make Apply-From mandatory).