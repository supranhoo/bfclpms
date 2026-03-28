

## Add Vessel Count Entry for Port Incentive

### The Gap
- **Production Data tab** already handles target/achieved entry for production, availability, maintenance, and metal_recovery categories — that's working.
- **Missing**: There is no place to enter "vessels handled" per employee per month for Port Incentive programs. The vessel rate is configured (₹ per vessel), but there's no monthly entry for actual vessel count.

### Solution
Add a **"Vessel Data"** section on the Production Data tab (or as a separate card below the existing grid) that appears when a vessel-rate program is selected. This section lets admin enter monthly vessels handled per mapped employee.

### Implementation

#### 1. Database Migration
Create `vessel_monthly_entries` table:
```
id, program_id, employee_id, month, year, vessels_handled (integer),
remarks, updated_by, created_at, updated_at
UNIQUE(program_id, employee_id, month, year)
```
RLS: admin + menu override users can CRUD; authenticated can read.

#### 2. New Hook: `useVesselMonthlyEntries.ts`
- `useVesselMonthlyEntries(programId, month, year)` — fetches entries joined with profiles
- `useUpsertVesselEntries()` — upsert mutation

#### 3. New Component: `VesselDataEntryGrid.tsx`
- Shows mapped employees (from `incentive_program_mappings` + `incentive_vessel_rates`) with their configured rate
- Columns: Employee Name, Code, Rate/Vessel, Vessels Handled (input), Total Amount (computed = rate × vessels), Remarks
- Month/Year selector (shared with production grid)
- Save All button

#### 4. Update `IncentiveConfig.tsx` — Production Data Tab
- Below `ProductionTargetGrid`, render `VesselDataEntryGrid` when any vessel-rate programs exist
- Or add a sub-tab/toggle to switch between "Production Targets" and "Vessel Entries"

#### 5. Update `compute-monthly-incentives` Edge Function
- For vessel-based programs: look up `vessel_monthly_entries` for the month → multiply by employee's rate from `incentive_vessel_rates` → that's the incentive amount (subject to KRA ≥ 3 gate)

### Files Changed
| File | Action |
|------|--------|
| Database migration | Create `vessel_monthly_entries` table with RLS |
| `src/hooks/useVesselMonthlyEntries.ts` | New — fetch/upsert vessel entries |
| `src/components/incentive/VesselDataEntryGrid.tsx` | New — monthly vessel count entry grid per employee |
| `src/pages/admin/IncentiveConfig.tsx` | Add vessel entry grid to Production Data tab |
| `supabase/functions/compute-monthly-incentives/index.ts` | Use vessel entries in calculation |
| `DOCUMENTATION.md` | Document vessel data entry |

### Risk Assessment
- **Data**: Additive — new table, no changes to existing schema
- **Regression**: Zero — production grid unchanged; vessel grid only appears for relevant programs
- **Security**: RLS with admin + menu override access

