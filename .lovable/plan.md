

## Add Excel Download to Incentive Data Entry

### What
Add a "Download Excel" button next to the program selector in the `UnifiedProductionDataTab`. The export will download the currently visible grid data as an `.xlsx` file, adapting columns based on the program type (Vessel, Production Daily, or Production Target).

### How

**File: `src/components/incentive/UnifiedProductionDataTab.tsx`**
- Add a `Download` button next to the program `Select` dropdown (visible only when a program is selected and data is loaded)
- Pass `selectedProgramId`, `selectedProgram.name`, and the detected program type (`vessel` / `daily` / `target`) to a new export utility

**New File: `src/components/incentive/IncentiveDataExport.tsx`**
- A button component that accepts `programId`, `programName`, and `programType`
- On click, fetches the relevant data from the database and exports via `xlsx`:

| Program Type | Data Source | Export Columns |
|---|---|---|
| **Vessel** | `incentive_vessel_rates` + `vessel_monthly_entries` | Employee, Code, Rate/Vessel, Vessels Handled, Total, Remarks |
| **Production Daily** | `incentive_production_rates` + `production_daily_entries` | Employee, Code, Designation, Department, Rate/Ton, Day 1..31, Total, Amount |
| **Production Target** | `incentive_production_targets` | Sub-Unit, Category, Target, Achieved, Incentive %, Remarks |

- Uses month/year filters matching the currently selected period
- File name: `{ProgramName}_{Month}_{Year}.xlsx`

### Technical Details
- Reuses existing `xlsx` library (already in the project via `OrgKpiBulkExport`)
- The export component will accept the grid's current state data as props (no extra DB fetch needed) OR re-fetch from DB to ensure completeness
- For Production Daily, all 31 day columns will be included regardless of the date-range toggle (full month export)

### Files to Change
| File | Change |
|---|---|
| `src/components/incentive/IncentiveDataExport.tsx` | New — export button component with xlsx generation logic |
| `src/components/incentive/UnifiedProductionDataTab.tsx` | Add export button next to program selector |
| `src/components/incentive/VesselDataEntryGrid.tsx` | Pass export-ready data up or add download button inline |
| `src/components/incentive/ProductionDailyGrid.tsx` | Add download button inline |
| `src/components/incentive/ProductionTargetGrid.tsx` | Add download button inline |
| `DOCUMENTATION.md` | Document export feature |

