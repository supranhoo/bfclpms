

## Completeness Gaps in Weightage Propagation Guard & Template Propagation

After reviewing the full implementation, I found several missing pieces across the propagation flow:

### 1. Missing Field Change Detection (Client-Side)

The `compareMap` in `TemplateFormDialog.tsx` (lines 159-176) does not track two fields that are listed as structural on the server:
- **`qualitative_options`** — if an admin changes tiered/binary options, the change is silently ignored during propagation
- **`require_resubmit_reason`** — toggling this in the form never gets detected as a change

These fields get saved to the template but are never included in `fields_changed`, so they never propagate.

### 2. No Confirmation Before Propagation

Clicking "Save & Propagate" immediately executes the bulk update. For a destructive operation affecting potentially hundreds of KPIs, there should be a confirmation dialog showing a summary (e.g., "This will update 47 KPIs across 12 employees. Continue?").

### 3. Hardcoded Year Selector

The year dropdown (line 746) is hardcoded to `[2025, 2026, 2027]`. Should be dynamically generated relative to the current year.

### 4. Change History Missing "Who"

`template_change_logs` stores `changed_by` (user ID), but `TemplateChangeHistory.tsx` never resolves it to a name. The history entries don't show who performed the propagation.

### 5. No Select All / Deselect All for Employee Scope

When "Selected employees only" is chosen, there are no bulk selection controls for the employee list.

---

### Plan

| # | File | Change |
|---|------|--------|
| 1 | `TemplateFormDialog.tsx` | Add `qualitative_options` and `require_resubmit_reason` to the `compareMap` so changes are detected and propagated. Use JSON.stringify for deep comparison of `qualitative_options`. |
| 2 | `TemplateFormDialog.tsx` | Add a confirmation `AlertDialog` that appears when "Save & Propagate" is clicked — shows field count, KPI count, employee count summary before executing. |
| 3 | `TemplateFormDialog.tsx` | Replace hardcoded `[2025, 2026, 2027]` with dynamic range: `[currentYear - 1, currentYear, currentYear + 1]`. |
| 4 | `TemplateFormDialog.tsx` | Add "Select All / Deselect All" toggle above the employee list when scope is "selected". |
| 5 | `TemplateChangeHistory.tsx` | Fetch profile names for `changed_by` IDs and display "by [Name]" in each history entry. Update the hook query to join profiles or fetch separately. |
| 6 | `useKpiTemplates.ts` | Update `useTemplateChangeHistory` query to join on profiles table to get the changer's name. |

### UI Changes

**Confirmation dialog** (appears on "Save & Propagate" click):
```text
┌─────────────────────────────────────┐
│  Confirm Propagation                │
│                                     │
│  This will update:                  │
│  • 3 fields (target value, r5, r4)  │
│  • Across all linked employees      │
│  • Effective from March 2026        │
│                                     │
│  This action cannot be undone.      │
│                                     │
│         [Cancel]  [Propagate Now]   │
└─────────────────────────────────────┘
```

**Select All** in employee list:
```text
Scope: ○ All linked employees (12)  ● Selected employees only
┌──────────────────────────────────┐
│ ☐ Select All                     │
│ ☑ John Smith           3 KPIs   │
│ ☑ Jane Doe             2 KPIs   │
│ ☐ Bob Wilson           4 KPIs   │
└──────────────────────────────────┘
```

**Change History** — adds "by" line:
```text
March 2026                    05 Mar 2026, 14:30
3 KPIs updated across 2 employees    by Admin User
```

