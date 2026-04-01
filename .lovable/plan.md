

## Plan: Add Reconfirmation Dialogs for All Destructive Actions

### Problem
The "Clear all review data (full reset)" in the Step Back dialog executes immediately without a secondary confirmation, risking accidental data deletion. Several other delete buttons across the system also lack confirmation dialogs.

### Approach
Create a reusable `ConfirmDestructiveAction` wrapper component, then apply it to the Step Back full-reset flow and all unprotected delete buttons.

### Changes

**1. Create `src/components/ui/ConfirmDestructiveDialog.tsx`**
- A reusable `AlertDialog`-based component with props: `open`, `onConfirm`, `onCancel`, `title`, `description`, `confirmLabel` (default "Delete"), `isLoading`
- Red destructive styling on the confirm button
- Used system-wide wherever a delete/reset confirmation is needed

**2. `src/components/admin/AdminStatusStepBackDialog.tsx`**
- When "Confirm Full Reset" is clicked, instead of executing immediately, show a nested `ConfirmDestructiveDialog` with message: *"This will permanently delete ALL scores, remarks, evidence, and achieved values for this KPI. This action cannot be undone. Are you sure?"*
- Only after confirming the nested dialog does the mutation fire
- Non-full-reset step-backs proceed as before (single confirmation is sufficient)

**3. Fix unprotected delete buttons (no confirmation dialog currently)**

These components fire `.mutate()` or `delete()` directly on click with no confirmation:

| Component | Action | Fix |
|-----------|--------|-----|
| `DisqualificationRulesEditor.tsx` | Delete DQ rule | Wrap in confirm dialog |
| `IncentiveSlabEditor.tsx` | Delete slab | Wrap in confirm dialog |
| `AllocationRulesEditor.tsx` | Delete allocation rule | Wrap in confirm dialog |
| `EligibilityFieldsConfig.tsx` | Delete custom field | Wrap in confirm dialog |
| `BusinessUnitManager.tsx` | Delete sub-unit | Wrap in confirm dialog |
| `CustomTabDataGrid.tsx` | Delete row | Wrap in confirm dialog |
| `CompetencyManagerTab.tsx` | Delete competency | Wrap in confirm dialog |
| `ObservationCard.tsx` | Delete observation | Wrap in confirm dialog |
| `SlabCategorySelector.tsx` | Delete slab category | Wrap in confirm dialog |

Each will use the shared `ConfirmDestructiveDialog` with context-appropriate messages.

**4. Already protected (no changes needed)**
- `Organization.tsx` — has `AlertDialog`
- `TemplateBundles.tsx` — has `AlertDialog`
- `KRALibrary.tsx` — has `AlertDialog`
- `WorkflowConfig.tsx` — has `AlertDialog`
- `KraIssuanceConfirmDialog.tsx` — has `AlertDialog`

**5. `DOCUMENTATION.md`** — v2.15.52

### Technical Notes
- The reusable component uses `AlertDialog` from Radix (already in the project)
- For the Step Back dialog: a `showFullResetConfirm` state gates the nested confirmation
- Each unprotected component gets a `deletingId` state + the shared dialog, replacing direct `onClick={() => mutate(id)}` patterns

### Risk
- Low — purely additive UI guards; no business logic changes
- All existing confirmed-delete flows remain unchanged

