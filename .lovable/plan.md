

## Plan: Conditional Production Data Tab — Show Vessel Grid for Port Incentive Programs

### Problem
When "Port Incentive" (a fixed-rate/vessel program) is selected in the Production Data tab, the system shows the `ProductionTargetGrid` with irrelevant fields (Sub-Unit/Furnace, Category, Target, Achieved, Incentive %). Port incentive programs should only show the `VesselDataEntryGrid` with employee vessel counts, since employees and rates are already configured.

### Solution
Merge the two grids into a **single unified Production Data tab** with one program selector. When the selected program has `incentive_base === 'fixed'` (port/vessel program), render the `VesselDataEntryGrid`. Otherwise, render the `ProductionTargetGrid` table.

### Changes

**`src/pages/admin/IncentiveConfig.tsx`** — Replace the Production Data tab content:
- Remove the separate `ProductionTargetGrid` + `VesselDataEntryGrid` side-by-side layout
- Add a single unified component that has one program selector at the top
- Conditionally render the appropriate grid based on selected program's `incentive_base`

**`src/components/incentive/ProductionTargetGrid.tsx`** — Accept optional `programId` prop:
- Allow parent to pass a pre-selected program ID and hide the internal program selector when controlled externally

**`src/components/incentive/VesselDataEntryGrid.tsx`** — Accept optional single-program mode:
- When only one program is passed (the selected port incentive), hide the program selector

**Alternative (simpler) approach** — Modify `ProductionTargetGrid` directly:
- When the selected program has `incentive_base === 'fixed'`, instead of showing the target/achieved table, render an inline message: "This is a vessel-based program. Use the Vessel Data Entry below." and auto-scroll/highlight the vessel grid.

**Recommended approach**: Restructure the Production Data tab in `IncentiveConfig.tsx` with a single top-level program + month/year selector, then conditionally render:
- **Vessel program** → `VesselDataEntryGrid` (employee list with vessel count input + auto-calculated amount)
- **Slab program** → `ProductionTargetGrid` (sub-unit/category/target/achieved table)

### Files Modified

| File | Change |
|------|--------|
| `src/pages/admin/IncentiveConfig.tsx` | Unified program selector in Production Data tab; conditional grid rendering |
| `src/components/incentive/ProductionTargetGrid.tsx` | Accept `selectedProgramId` prop to skip internal selector |
| `src/components/incentive/VesselDataEntryGrid.tsx` | Accept single program directly (no multi-program selector needed) |
| `DOCUMENTATION.md` | v2.15.9 changelog |

### Risk Assessment
- **Regression**: Zero — same components, just conditional rendering logic
- **Data**: No schema changes; both grids use existing tables
- **UX**: Cleaner — one selector, one grid, no confusion about which fields apply

