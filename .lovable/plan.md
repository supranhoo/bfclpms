

## Plan: Fix Daily Grid — Company Rates & Effective-Dated Rates Not Resolving

### RCA
The error fires when `gridEmployees` is empty, which happens when `resolveEmployeeRate()` returns `source: 'none'` for every mapped employee. Two root causes:

1. **Company-scope blind**: `resolveEmployeeRate()` in `src/hooks/useProductionDailyEntries.ts` only checks `employee → department → bu → common`. It never checks `rate_type='company'`. If a user defined only company-wise rates (the most common case after the recent change), every employee resolves to `none`.

2. **No date filtering**: The resolver picks the first matching row via `find()` instead of the latest `effective_from <= period end`. With multiple historical rows the wrong row may be picked or a future-dated row may be chosen.

The compute edge function already does both correctly — only the **UI helper** is stale.

### Change

**File 1: `src/hooks/useProductionDailyEntries.ts`** — extend `resolveEmployeeRate()`:
- Add `companyId: string | null` parameter (4th arg) and `targetDate: string` (5th arg, defaults to today).
- Filter rates by `effective_from <= targetDate` first.
- For each tier, pick the row with the **maximum `effective_from`** (date-aware), not just `find()`.
- Add `'company'` tier between `bu` and `common`. Final cascade: **employee → department → bu → company → common**.
- Update `ResolvedRate.source` union to include `'company'`.

**File 2: `src/components/incentive/ProductionDailyGrid.tsx`**
- Resolve each employee's `companyId` via the chain: `profiles.company_id` → `divisions.company_id` → `business_units.company_id` (mirroring how the compute engine derives it). Easiest path: extend the `mapped-employees-for-grid` query's `select` to pull `company_id` plus the joins through `departments → business_units → divisions → companies`.
- Compute `targetDate` = last day of selected `month`/`year` (so historical months pick the correct dated rate).
- Pass `companyId` and `targetDate` into `resolveEmployeeRate()`.
- Add `'company'` to the `sourceBadge()` variants map (renders "com" pill).

**File 3 (parity check): `src/components/incentive/IncentiveDataExport.tsx`** and any other caller of `resolveEmployeeRate()` — pass the new args so Excel export shows the same rate as the grid.

### Files Touched

| File | Change |
|---|---|
| `src/hooks/useProductionDailyEntries.ts` | Extend resolver: add company tier + date filter |
| `src/components/incentive/ProductionDailyGrid.tsx` | Resolve companyId, pass targetDate, badge for 'company' |
| `src/components/incentive/IncentiveDataExport.tsx` (if it calls the helper) | Pass new args |

### Risk & Impact

| Area | Impact |
|---|---|
| Data | None — read-only resolution change |
| Workflow | None |
| Compute | UI now matches edge function — same rate shown and saved |
| Regression | Low — older callers without `companyId`/`targetDate` still work via defaults (companyId=null skips company tier; targetDate=today preserves current behaviour) |
| Mitigation | Defaults keep legacy 4-tier behaviour intact when company scope isn't used |

### Out of Scope
- Edge-function changes (already correct)
- Slab resolver UI parity (separate concern)

