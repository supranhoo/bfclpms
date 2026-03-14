

# Rethink Mismatch Indicator: Acknowledge vs Dismiss

## Problem
Currently, any KPI with different weightage values across months is flagged as a red "mismatch." But often an admin intentionally sets different weightages for different months (e.g., a KPI is more important in Q3 than Q1). These intentional variations appear identical to genuine errors, creating noise and confusion.

## Solution: "Acknowledge" Mechanism

Instead of a binary mismatch/no-mismatch, introduce an **acknowledge** action that lets admins mark a variance as intentional. The system then distinguishes:

- **Unacknowledged variance** (red/destructive) — likely needs fixing
- **Acknowledged variance** (amber/outline) — admin confirmed it's intentional

### How it works

1. **New DB column** on `kpis` table: `weightage_variance_acknowledged boolean DEFAULT false`. When an admin acknowledges a variance on a KPI row, all KPI records for that employee + kra_name + kpi_name in the fiscal year get this flag set to `true`.

2. **Reset on edit**: Whenever a weightage is edited via `WeightageCellEditor` with scope `this` or `forward` (i.e., an edit that could create a new variance), the flag resets to `false` so the admin must re-acknowledge if a variance still exists.

3. **UI in the matrix table**: The existing mismatch cell (currently just a red `AlertTriangle`) becomes clickable:
   - **Unacknowledged**: Red `AlertTriangle` icon — clicking opens a small confirm popover: "Mark this variance as intentional?" with a Save button
   - **Acknowledged**: Amber `CheckCircle2` icon with "Noted" label — clicking allows un-acknowledging

4. **Summary badge split**: The top-level badge changes from `"204 Mismatches"` to two counts:
   - `"12 Variances"` (red) — unacknowledged, need attention
   - `"192 Acknowledged"` (amber/outline) — intentional, info only
   - When all are acknowledged: green `CheckCircle2` "All clear"

5. **Filter toggle**: Add a "Show only unacknowledged" toggle so admins can focus on real issues.

### Files to modify

- **DB migration**: Add `weightage_variance_acknowledged` column to `kpis` table
- **`useKpiWeightageMatrix.ts`**: Fetch the new column, expose `isAcknowledged` on `KpiRow`
- **`KpiWeightageDashboard.tsx`**: Split badge into acknowledged/unacknowledged counts, add filter toggle, render acknowledge action in mismatch column
- **`WeightageCellEditor.tsx`**: Reset `weightage_variance_acknowledged = false` on scope `this`/`forward` edits
- **New component `AcknowledgeVariancePopover.tsx`**: Small popover with confirm/undo for acknowledging a variance row

### Audit trail
All acknowledge/un-acknowledge actions are logged to `kpi_audit_logs` with action `weightage_variance_acknowledged` so there's a record of who accepted the variance and when.

