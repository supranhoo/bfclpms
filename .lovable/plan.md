

## RCA: Accidental Auto-Propagation via Per-Row Propagate Button

### Root Cause

**No confirmation dialog on per-row propagate button.** The scoped entry table (`OrgKpiScopedEntryTable.tsx`) renders a small (28x28px) arrow button per employee row that directly calls `handleSaveAndPropagate([scopeId])` with zero confirmation. This button sits adjacent to the file upload and remarks columns.

On Biswajit's mobile device (389px viewport), while scrolling horizontally or entering data values, accidental taps on this button trigger immediate propagation for that employee — saving the value AND pushing it to the employee's scorecard, AND setting `org_kpi_values.status = 'propagated'` (which locks the card for non-admins).

**Evidence:**
- The main "Propagate" button (line 732) has an `AlertDialog` confirmation
- The "Propagate Selected" button (line 688) has an `AlertDialog` confirmation  
- The per-row button (line 594-600) calls `onPropagateRow?.(row.scopeId)` directly — **no confirmation**
- Biswajit is a `manager` role, not `admin`, so once status becomes `propagated`, the card locks (`isLocked = data.status === 'propagated' && !isAdmin`)
- Audit logs show "updated" entries (auto-save) mixed with propagated status changes, consistent with accidental taps during data entry

### Fix — 2 parts

#### Part 1: Add AlertDialog Confirmation to Per-Row Propagate Button

Wrap the per-row propagate button in an `AlertDialog` matching the same pattern used by the main propagate buttons. The dialog should:
- Show the employee name being propagated
- Warn that it will update their scorecard
- Require explicit confirmation via "Propagate" button

This applies in `OrgKpiScopedEntryTable.tsx`, in the `EmployeeRow` component.

#### Part 2: Documentation

| File | Change |
|------|--------|
| `src/components/admin/OrgKpiScopedEntryTable.tsx` | Add `AlertDialog` confirmation to per-row propagate button |
| `POLICY.md` | Add §59: All propagation actions require explicit user confirmation |
| `DOCUMENTATION.md` | Version bump |

### Risk Assessment
- **No regression**: Additive confirmation dialog. Propagation logic untouched.
- **Fixes existing UX issue**: Prevents accidental propagation on mobile/small screens.
- **Forward-looking**: Policy ensures any future propagation path also requires confirmation.

