

# Allow Editing Already Org-Level KPIs from Suggestions

## Problem

In the Suggestions tab, KPIs that are already marked as org-level show a static "Already Org-Level" badge with no action. Admins cannot update the scope (Organization/Department/Employee) from here -- they have to go elsewhere.

## Solution

Replace the static badge with a clickable "Edit Scope" button that opens the same `MarkOrgLevelDialog`, but in an **edit mode** that:
- Shows the current scope value (pre-populated)
- Lets the admin change it
- Updates instead of inserting

## Changes

### File: `src/components/admin/OrgKpiSuggestionsPanel.tsx`

Replace the static "Already Org-Level" badge (line 150-151) with an "Edit Scope" button that opens the dialog -- same as the "Mark Org-Level" button does for non-org KPIs.

### File: `src/components/admin/MarkOrgLevelDialog.tsx`

- Accept an optional `isEdit` prop (derived from `suggestion.already_org_level`)
- When in edit mode:
  - Change dialog title to "Update Organization-Level KPI"
  - Change description to "Update the scope for this org-level KPI."
  - Pre-fetch and display the current `org_level_scope` value in the scope selector
  - Confirm button text changes to "Update"
- The mutation already works for both cases (it updates matching records regardless of current `is_org_level` state)

### File: `src/hooks/useOrgKpiSuggestions.ts`

Add `org_level_scope` to the suggestion data for already-org-level KPIs so the dialog can pre-populate the scope selector.

### File: `DOCUMENTATION.md`

Update to document the edit capability for already-org-level KPIs in the Suggestions tab.

## Technical Details

| File | Change |
|---|---|
| `src/components/admin/OrgKpiSuggestionsPanel.tsx` | Replace static badge with "Edit Scope" button for already-org-level rows |
| `src/components/admin/MarkOrgLevelDialog.tsx` | Add edit mode with pre-populated scope, different title/description/button text |
| `src/hooks/useOrgKpiSuggestions.ts` | Include `org_level_scope` in suggestion data for already-org-level KPIs |
| `DOCUMENTATION.md` | Document edit capability |

No database or schema changes needed.

