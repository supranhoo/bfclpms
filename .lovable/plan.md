

# Enhanced KRA Issuance Dialog: Save Draft, Add KRA, and Remove KPI

## Overview

Three major enhancements to the "Issue KRAs -- Confirmation" dialog to make it a complete KRA management workspace:

1. **Save Draft** -- Persist inline weightage changes without issuing, so admins can resume later
2. **Add KRA** -- Open the full "Assign New KRA" dialog directly from within the issuance dialog (pre-filled with employee/period)
3. **Select to Remove KPI** -- Multi-select checkboxes to pick and delete KPIs from the list

---

## Feature 1: Save Draft Button

### What It Does
- Saves any weightage overrides the admin has made to the database without marking KPIs as issued or sending notifications
- Shows a success toast confirming the draft was saved
- Does NOT close the dialog, allowing the admin to continue editing or close manually
- Button is disabled when there are no unsaved changes

### Technical Detail

**New mutation in `KraIssuanceConfirmDialog.tsx`:**
```typescript
const saveDraftMutation = useMutation({
  mutationFn: async () => {
    const changed = Object.entries(weightageOverrides);
    if (changed.length === 0) throw new Error('No changes to save');
    for (const [id, newVal] of changed) {
      const { error } = await supabase.from('kpis').update({ weightage: newVal }).eq('id', id);
      if (error) throw error;
    }
    return changed.length;
  },
  onSuccess: (count) => {
    queryClient.invalidateQueries({ queryKey: ['issuance-kpis'] });
    setWeightageOverrides({}); // Clear overrides since they are now saved
    toast({ title: 'Draft Saved', description: `${count} weightage(s) updated.` });
  },
});
```

**Button placement:** In the `DialogFooter`, between Cancel and "Confirm & Issue":
```
[ Cancel ]  [ Save Draft ]  [ Confirm & Issue KRAs ]
```

The "Save Draft" button is:
- `variant="secondary"` to visually differentiate from the primary action
- Disabled when `Object.keys(weightageOverrides).length === 0` (no pending changes)
- Shows a spinner during save

---

## Feature 2: Add KRA Button

### What It Does
- Opens the existing `AdminKpiCreateDialog` pre-filled with the current employee and review period/year
- When the new KRA is created, the issuance dialog's KPI list auto-refreshes (via query invalidation)
- Uses the full feature set of AdminKpiCreateDialog (cascading dropdowns, templates, UOM types, thresholds, etc.)

### Technical Detail

**New state in `KraIssuanceConfirmDialog.tsx`:**
```typescript
const [isAddKraOpen, setIsAddKraOpen] = useState(false);
```

**Button placement:** In the toolbar area above the table, next to the weightage summary card:
```
[ + Add KRA ]     (right-aligned, above the KPI table)
```

**AdminKpiCreateDialog integration:**
- The existing `AdminKpiCreateDialog` already accepts `defaultEmployeeId` prop
- New props needed: `defaultReviewPeriod` and `defaultReviewYear` to pre-fill period fields
- On close, the `issuance-kpis` query is invalidated to refresh the table

**Changes to `AdminKpiCreateDialog.tsx`:**
- Add two new optional props: `defaultReviewPeriod?: string` and `defaultReviewYear?: number`
- Use these to set initial values for `reviewPeriod` and `reviewYear` state
- Hide the employee selector when `defaultEmployeeId` is provided (employee is already determined)

---

## Feature 3: Select to Remove KPI

### What It Does
- Adds a checkbox column as the first column in the KPI table
- A "Select All" checkbox in the header
- When one or more KPIs are selected, a red "Remove Selected (N)" button appears above the table
- Clicking it shows a confirmation dialog listing the KPIs to be deleted
- On confirmation, the selected KPIs are deleted from the database and the table refreshes

### Technical Detail

**New state:**
```typescript
const [selectedKpiIds, setSelectedKpiIds] = useState<Set<string>>(new Set());
const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
```

**Checkbox column:** Added as the first column with a header "Select All" checkbox:
```tsx
<TableHead className="w-10">
  <Checkbox
    checked={kpis?.length > 0 && selectedKpiIds.size === kpis.length}
    onCheckedChange={(checked) => {
      setSelectedKpiIds(checked ? new Set(kpis.map(k => k.id)) : new Set());
    }}
  />
</TableHead>
```

**Delete mutation:**
```typescript
const removeKpisMutation = useMutation({
  mutationFn: async (ids: string[]) => {
    const { error } = await supabase.from('kpis').delete().in('id', ids);
    if (error) throw error;
    return ids.length;
  },
  onSuccess: (count) => {
    queryClient.invalidateQueries({ queryKey: ['issuance-kpis'] });
    queryClient.invalidateQueries({ queryKey: ['kpis'] });
    queryClient.invalidateQueries({ queryKey: ['all-kpis'] });
    setSelectedKpiIds(new Set());
    toast({ title: `${count} KPI(s) removed` });
  },
});
```

**Confirmation:** Uses an inline `AlertDialog` within the issuance dialog that lists the selected KPI names before deletion.

---

## Additional Suggestions (included in the build)

1. **Unsaved changes warning**: When admin tries to close the dialog with pending weightage overrides, show a confirmation: "You have unsaved changes. Discard?"
2. **Empty state enhancement**: When all KPIs are removed, show a helpful message with an "Add KRA" call-to-action
3. **Badge count in header**: Show count of selected KPIs in the dialog title area when selection is active

---

## Files to Change

| File | Change |
|---|---|
| `src/components/admin/KraIssuanceConfirmDialog.tsx` | Add Save Draft mutation, Add KRA button + dialog, checkbox selection + remove mutation, unsaved changes guard |
| `src/components/admin/AdminKpiCreateDialog.tsx` | Add `defaultReviewPeriod` and `defaultReviewYear` props, hide employee selector when pre-filled |
| `DOCUMENTATION.md` | Document all three new features |

## Testing Plan

After implementation, the following should be verified:
- Save Draft saves weightage overrides without issuing or sending notifications
- Save Draft button is disabled when no changes are pending
- Add KRA opens the full creation dialog pre-filled with the correct employee and period
- Newly added KRA appears in the issuance table immediately
- Checkbox selection works: individual select, select all, deselect
- Remove Selected deletes KPIs after confirmation and refreshes the table
- Closing the dialog with unsaved changes shows a discard warning
- Total weightage recalculates correctly after adding or removing KPIs
- The "Confirm & Issue" button still works correctly with all new features active

