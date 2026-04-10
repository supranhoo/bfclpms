

## Revised Plan: Two-Phase Repair With Preview, Selection & Downloadable Report

### Current behavior
The "Run Repair" button immediately repairs all orphaned KPIs — no preview, no selection, no report.

### New behavior — Two-phase workflow

**Phase 1: Scan (read-only)**
- Admin clicks "Scan for Orphaned KPIs" — calls the edge function in `mode: "scan"` (new parameter)
- Edge function returns a `details` array without modifying any data
- Each detail entry includes: `kpi_id`, `kpi_name`, `kra_name`, `employee_name`, `employee_id`, `category`, `review_period`, `review_year`, `achieved_value`, `action` ("repairable" | "skippable"), `reason`
- UI renders a data table with checkboxes so admin can select which KPIs to repair
- "Select All" / "Deselect All" toggles
- "Download Scan Report" button exports the full scan results as an Excel file (using `xlsx`)

**Phase 2: Repair (selected only)**
- Admin reviews the table, selects specific KPIs, clicks "Repair Selected"
- `ConfirmDestructiveDialog` asks for confirmation before proceeding
- Calls the edge function with `mode: "repair"` and `kpi_ids: [...]` (array of selected IDs)
- Edge function only processes the provided KPI IDs
- Returns detailed results per KPI
- UI shows results summary + "Download Repair Report" button with a multi-sheet Excel:
  - **Summary sheet**: timestamp, totals (repaired, skipped, errors, null fixed)
  - **Details sheet**: per-KPI row with employee name, KPI name, action taken, achieved value, score, rating
  - **Errors sheet**: KPI ID + error message

### Technical changes

**1. Update edge function** (`supabase/functions/repair-orphaned-propagations/index.ts`)
- Accept `mode: "scan" | "repair"` in request body (default: `"repair"` for backward compat)
- Accept optional `kpi_ids: string[]` to limit repair to selected KPIs
- In scan mode: run the same queries but return details without any INSERT/UPDATE
- In repair mode with `kpi_ids`: filter `orphanedKpis` to only matching IDs
- Add `full_name` to the profiles select; build a `details` array with per-KPI info
- Return `details` array in response alongside existing summary counts

**2. Update `DataRepairTab.tsx`**
- Two-step UI: Scan → Select → Repair
- State: `scanResults` (detail rows), `selectedIds` (Set), `repairResults`
- Data table with columns: checkbox, Employee, KRA, KPI, Period/Year, Achieved, Status, Reason
- "Download Scan Report" and "Download Repair Report" buttons using `xlsx`
- Confirmation dialog before repair via `ConfirmDestructiveDialog`

**3. Update `DOCUMENTATION.md` and `POLICY.md`**
- Document the two-phase scan-then-repair workflow
- Version bump

### Risk Assessment
- **Backward compatible**: `mode` defaults to `"repair"`, so existing behavior unchanged if called without it
- **Security**: Same admin-only check; no new access surfaces
- **Data safety**: Scan mode is read-only; repair requires explicit selection + confirmation dialog

