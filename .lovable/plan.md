

## Plan: Add Employee Selection Checkboxes + Mark Paid Impact Preview

### Changes to `src/components/incentive/MonthlyIncentiveTable.tsx`

**1. Add row-level checkbox selection**
- Add `selectedIds` state (`Set<string>`)
- Add a header checkbox for select-all (filtered) toggle
- Add a `Checkbox` in each table row (first column)
- Selection only available for `confirmed` status rows (since only confirmed can be marked paid)

**2. Update "Confirm All" and "Mark Paid" to work with selection**
- If rows are selected, "Confirm All" confirms only selected draft rows; otherwise confirms all drafts (current behavior)
- "Mark Paid" operates on selected confirmed rows; if none selected, operates on all confirmed (current behavior)

**3. Add impact confirmation dialog before Mark Paid**
- New `AlertDialog` that shows before executing Mark Paid:
  - Number of employees being marked paid
  - Total incentive amount (₹) for those records
  - List of employee names (scrollable, max 10 shown)
  - "Cancel" and "Confirm Mark Paid" buttons
- Only after user confirms does the mutation fire

**4. Summary bar update**
- Show selected count badge near the action buttons when selection is active (e.g., "3 selected")

### Files Modified

| File | Change |
|------|--------|
| `src/components/incentive/MonthlyIncentiveTable.tsx` | Add `Checkbox` column, selection state, impact dialog, update Confirm/MarkPaid logic |
| `DOCUMENTATION.md` | v2.15.47 |

### Technical Notes
- Import `Checkbox` from UI components and `AlertDialog` for the confirmation
- Selection resets on filter/compute changes
- The impact dialog is purely client-side — no extra DB query needed since all data is already loaded

