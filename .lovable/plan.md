
## Goal

Relocate the "HR Review Notes — Role Access" configuration from its standalone admin page (`/admin/review-notes-access`) into **System Settings > Menu Access > Profile Mapping**, displayed as a collapsible sub-section under the "HR PMS" section, directly below the "HR PMS Review" row.

## Current State

- Standalone page at `/admin/review-notes-access` with a role x action toggle matrix (View All, Create, Edit, Delete, View Own Only)
- Sidebar entry "Review Notes Access" under admin menu items
- Stored in `system_settings` table under key `review_action_notes_visibility`

## Proposed UI

Inside the MappingTab, after the "HR PMS Review" row in the hr_pms section, render an inline expandable panel:

```text
┌─────────────────────────────────────────────────────────────────┐
│ Section │ Menu Item        │ View │ Add │ Update │ Delete       │
├─────────┼──────────────────┼──────┼─────┼────────┼──────────────┤
│ HR PMS  │ HR PMS Review    │  ☑   │  ☑  │   ☑    │   ☑         │
│         │                  │      │     │        │             │
│         │ ┌── HR Review Notes Access ──────────────────────┐  │
│         │ │                                                │  │
│         │ │  Role          │ViewAll│Create│Edit│Delete│Own  │  │
│         │ │  Admin [lock]  │  ●   │  ●  │  ● │  ●  │     │  │
│         │ │  Manager       │  ●   │  ●  │    │     │     │  │
│         │ │  Employee      │      │     │    │     │  ●  │  │
│         │ │  Auditor       │  ●   │     │    │     │     │  │
│         │ │  Management    │  ●   │     │    │     │     │  │
│         │ │  HR PMS        │  ●   │  ●  │  ● │  ●  │     │  │
│         │ │  Skip-Level    │  ●   │  ●  │    │     │     │  │
│         │ │                                                │  │
│         │ │          [Save Review Notes Permissions]        │  │
│         │ └────────────────────────────────────────────────┘  │
│         │                                                     │
│ Audit   │ Audit Panel      │  ☑   │  ☑  │   ☑    │   ☑        │
└─────────────────────────────────────────────────────────────────┘
```

The sub-panel appears as a bordered card/accordion below the HR PMS Review checkbox row. It contains the same role x action switch matrix currently on the standalone page, with its own "Save" button. It loads/saves from the same `system_settings` key (`review_action_notes_visibility`).

## Changes

### 1. Create `ReviewNotesAccessInline` component
New file: `src/components/admin/ReviewNotesAccessInline.tsx`
- Extract the matrix UI from `ReviewNotesAccess.tsx` into a compact inline version (no Card wrapper, no page header)
- Same toggle logic, same save behavior using `useSystemSetting` + `useUpdateSystemSetting`
- Compact table with smaller text to fit inside the mapping tab

### 2. Embed in MappingTab (`AccessProfilesManager.tsx`)
- After rendering the `hr_pms` section rows in the Menu Access Rights table, inject a full-width `TableRow` containing the `ReviewNotesAccessInline` component inside a collapsible accordion/details element
- Label: "HR Review Notes — Role Access"
- Only visible when a profile is selected (same as the rest of the mapping tab)

### 3. Remove standalone page and sidebar entry
- Remove route `/admin/review-notes-access` from `App.tsx`
- Remove lazy import of `ReviewNotesAccess`
- Remove sidebar entry "Review Notes Access" from `AppSidebar.tsx`
- Keep `src/pages/admin/ReviewNotesAccess.tsx` file (can delete later) or delete it now

### 4. Update POLICY.md and DOCUMENTATION.md
- Note the relocation of Review Notes Access configuration

No database changes required. The `review_action_notes_visibility` system setting and `useReviewNoteAccess` hook remain unchanged.
