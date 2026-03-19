

## Remaining Improvements for KRA Library & Template Propagation

After reviewing the full codebase, here are the gaps that still need attention:

### 1. No Duplicate Template Action
There is no way to clone/duplicate an existing template. Admins must recreate from scratch.

**Change**: Add a "Duplicate" option in the dropdown menu on `KRALibrary.tsx` that creates a copy with " (Copy)" appended to the title.

### 2. No Category Filter on the Library Page
The table only has a text search. Admins managing dozens of templates cannot filter by category.

**Change**: Add a category dropdown filter next to the search input on `KRALibrary.tsx`.

### 3. Delete Doesn't Warn About Linked KPIs
The delete confirmation says "This action cannot be undone" but doesn't mention if the template has linked KPIs that will become orphaned (lose their `source_template_id` link).

**Change**: Show linked KPI count in the delete confirmation dialog. If count > 0, display a warning: "This template is linked to X KPIs. They will no longer receive propagated updates."

### 4. No Rollback/Undo for Propagation
Once propagation executes, there is no way to revert. The audit trail logs old values but there's no UI to trigger a rollback.

**Change**: Add a "Revert" button on each entry in `TemplateChangeHistory.tsx` that creates a reverse propagation using the stored `old` values from `fields_changed`.

### 5. Table Missing Weightage & Frequency Columns
The library table shows Target but not Weightage or Frequency — key fields admins need at a glance.

**Change**: Add Weightage and Frequency columns to the table in `KRALibrary.tsx`.

### 6. No Pagination or Sorting
The template table has no pagination or column sorting, which will become a problem as the library grows.

**Change**: Add client-side sorting (click column headers) and pagination (e.g., 20 per page) to `KRALibrary.tsx`.

---

### Plan

| # | File | Change |
|---|------|--------|
| 1 | `KRALibrary.tsx` | Add "Duplicate" dropdown item that calls `useCreateKpiTemplate` with cloned data |
| 2 | `KRALibrary.tsx` | Add category filter dropdown next to search bar |
| 3 | `KRALibrary.tsx` | Show linked count in delete dialog with orphan warning |
| 4 | `KRALibrary.tsx` | Add Weightage and Frequency columns to the table |
| 5 | `KRALibrary.tsx` | Add column header sorting and simple pagination (20/page) |
| 6 | `TemplateChangeHistory.tsx` | Add "Revert" button per entry that triggers reverse propagation |
| 7 | `useKpiTemplates.ts` | Add `useRevertTemplatePropagation` mutation that sends reversed `fields_changed` to the edge function |

### UI Additions

**Category filter** (next to search):
```text
[Search templates...    ] [All Categories ▼]
```

**Delete warning with linked count**:
```text
┌────────────────────────────────────────┐
│  Delete Template                       │
│                                        │
│  Are you sure you want to delete       │
│  "Sales Target KRA"?                   │
│                                        │
│  ⚠ This template is linked to 24 KPIs │
│  across 8 employees. They will no      │
│  longer receive propagated updates.    │
│                                        │
│           [Cancel]  [Delete]           │
└────────────────────────────────────────┘
```

**Table columns** (added):
```text
Title | Category | KRA/KPI | Target | Weightage | Frequency | Linked | Status | ⋮
```

**Revert button** in change history:
```text
March 2026                    05 Mar 2026, 14:30
3 KPIs updated across 2 employees    by Admin User
                                      [↩ Revert]
```

