

## Fix: Show Data Owner(s) and Data Entered By Separately

### Problem
1. **KPI Details table** on dashboards shows "Data by: [person who entered]" — but it should show **"Data Owner: X, Y"** (the assigned data owners from `org_kpi_data_owners` table), which can be multiple people.
2. **View KPI Details panel** (`KpiHeaderSection`) shows only "Data entered by: X" — it should show **both** "Data Owner: X, Y" **and** "Data entered by: Z" when they differ.

### Current State
- `entered_by_name` comes from `org_kpi_values` table — this is whoever physically entered the data value.
- Data Owners are stored in `org_kpi_data_owners` table with owner profiles — these are the designated responsible people.
- The two concepts are conflated: only `entered_by_name` is displayed, labeled misleadingly as "Data by".

### Plan

#### 1. Create a new hook: `useOrgKpiDataOwnerNames`
**File:** `src/hooks/useOrgKpiDataOwner.ts` (add to existing file)

- New hook that fetches all `org_kpi_data_owners` with joined `profiles.full_name`.
- Returns a `Map<string, string[]>` where key is `categoryId||kraName||kpiName` (lowercased) and value is array of owner names.
- This is a single bulk query (like `useOrgKpiDataOwners` but optimized for name-only lookup across all org KPIs).

#### 2. Update KPI Details Table — show "Data Owner" instead of "Data by"
**File:** `src/components/review/KpiDetailsTable.tsx`

- Add `dataOwnerNames` prop: `Map<string, string[]>` (owner names by KPI key).
- Replace the "Data by" badge with "Data Owner: X, Y" using the owner names map.
- If no owners assigned, show nothing (current behavior for missing data).

**File:** `src/components/review/MobileKpiCard.tsx` — same change.
**File:** `src/components/dashboard/MobileKpiCard.tsx` — same change.

#### 3. Update all scorecards to pass `dataOwnerNames` to KpiDetailsTable
**Files:** `EmployeeScorecard.tsx`, `UnifiedScorecard.tsx`, `ManagementScorecard.tsx`, `AuditScorecard.tsx`

- Call `useOrgKpiDataOwnerNames()` hook in each scorecard.
- Pass the map as a prop to `KpiDetailsTable`.

#### 4. Update View KPI Details panel — show both Data Owner and Data Entered By
**File:** `src/components/review/KpiHeaderSection.tsx`

- Add new prop: `orgKpiDataOwnerNames?: string[]` (list of owner names for this KPI).
- Display "Data Owner: X, Y" badge (always, if owners exist).
- Display "Data entered by: Z" badge (only if `entered_by_name` differs from the owner names, or always show both).
- Both badges shown side-by-side in the org KPI badge row.

**File:** `src/components/review/KpiReviewPanel.tsx` — pass through the new prop.

#### 5. Update all scorecard KPI detail views to pass owner names
**Files:** `EmployeeScorecard.tsx`, `UnifiedScorecard.tsx`, `ManagementScorecard.tsx`, `AuditScorecard.tsx`

- Look up owner names for the selected KPI and pass to `KpiReviewPanel`.

### Summary of Changes

| File | Change |
|------|--------|
| `useOrgKpiDataOwner.ts` | Add `useOrgKpiDataOwnerNames()` hook returning `Map<key, names[]>` |
| `KpiDetailsTable.tsx` | New prop `dataOwnerNames`, render "Data Owner: X, Y" instead of "Data by" |
| `MobileKpiCard.tsx` (review) | Same badge label change |
| `MobileKpiCard.tsx` (dashboard) | Same badge label change |
| `KpiHeaderSection.tsx` | New prop `orgKpiDataOwnerNames`, show both badges |
| `KpiReviewPanel.tsx` | Pass through `orgKpiDataOwnerNames` prop |
| 4 Scorecards | Call hook, pass map to table + owner names to review panel |

