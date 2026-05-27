## Problem

Production programme **Metal Sizing**, period **11-20 May 2026**, company **Saibal Kunar**:

- Data Entry grid Grand Total: **₹1,51,017**
- Incentive Report Total Amount: **₹1,43,506**
- Gap: **₹7,511** (~5%)

Spot-check from screenshots: Virendra Yadav (SK459) — 11.5 tons in entry × ₹503.39 (common rate badge) = **₹5,789** in grid, but Report shows **₹5,501**. Implied report rate ≈ ₹478.35 — i.e. compute is using a **different rate per ton** for at least some employees than the grid.

## Risk & Impact Report

- **Data Impact**: Pure read-of-truth bug; amounts in `employee_incentive_records.incentive_amount` are wrong. Re-running Compute after fix corrects them — no schema change.
- **Workflow Impact**: None. RLS, roles, status flow unchanged.
- **UI/UX Impact**: Report numbers shift to match grid; no layout change.
- **Regression Risk**: Touching rate resolution can affect every production programme. Mitigated by reusing the existing `resolveEmployeeRate` helper as the single source of truth.
- **Scalability**: No new queries; same data, same cascade.
- **Mitigation**: New unit tests pinning grid↔compute parity for the 5-tier cascade and effective-from gating.

## Root cause hypothesis

The data-entry grid (`ProductionDailyGrid.tsx`) and the edge function (`compute-monthly-incentives/index.ts`) **independently re-implement the rate cascade** (employee → department → BU → company → common, date-aware).

Drift points identified from code reading:

1. **Company resolution**: grid uses `profiles.company_id` OR `dept.business_units.divisions.company_id`. Server uses `empToCompanyDirect` OR `dept→BU→division→company` chain. If those maps disagree for some helpers (e.g., BU has no division but has a direct `company_id`), the server may match a **company-scope rate** while the grid falls through to **common ₹503.39** — producing a lower amount on the report.
2. Possible secondary: server's `prodEntryMap` aggregates all populated days; grid Grand Total filters to the selected sub-period. For a 11-20 view this can also disagree if Compute is run without `scope.payment_period` matching the filter.

Both must be confirmed against live data before patching.

## Plan

### Step 1 — Confirm RCA from DB (read-only)
Query for May 2026 Metal Sizing:
- All `incentive_production_rates` rows visible to Saibal Kunar helpers (employee/dept/BU/company/common, with `effective_from`).
- For 3 sample employees from the screenshot (Virendra Yadav SK459, Tika Ram Saw SK441, Sukar Karmali SK409): show `profiles.company_id`, dept→BU→division→company chain, the rate the **server cascade** would pick, and the rate the **grid cascade** would pick.

Verification: the picked rates differ for at least the employees whose grid vs report amounts differ.

### Step 2 — Single source of truth for rate cascade
Extract `resolveEmployeeRate` (currently in `src/hooks/useProductionDailyEntries.ts`) into a pure TS module `src/lib/incentiveRateResolver.ts` plus a mirrored Deno copy importable by the edge function via `supabase/functions/_shared/incentiveRateResolver.ts`. Both call sites import the same logic. Removes parallel implementations.

Company-id resolution is normalized to a single helper `resolveEmployeeCompanyId(emp, deptMap, buMap, divMap)` used by both grid and server — same precedence: `profiles.company_id` first, then `dept→BU→division→company`.

### Step 3 — Patch compute function
Replace the inline cascade in `supabase/functions/compute-monthly-incentives/index.ts` (lines 411–428) with calls to the shared resolver. No other behavior changes.

### Step 4 — Patch the grid
Replace the inline `employeeRates` memo in `ProductionDailyGrid.tsx` with the shared resolver + shared company-id helper. Behavior identical when data is consistent; drift is mathematically impossible afterwards.

### Step 5 — Tests (mandatory)
`src/test/incentiveRateResolver.test.ts`:
- 5-tier priority (employee beats dept beats BU beats company beats common).
- Effective-from gating (rate dated after period-end ignored; latest dated wins).
- Company-id fallback: `profiles.company_id` overrides dept-chain resolution.
- Parity scenario: same employee + same rates + same target date → grid call and server call return identical `{rate, source}`.

### Step 6 — Verify in preview
After deploy, hit **Compute** for May 2026 / Metal Sizing / Saibal Kunar / 11-20 and confirm Total Amount = ₹1,51,017. Capture before/after for the changelog.

### Step 7 — Docs & policy sync
- `DOCUMENTATION.md` → Version History: "Unified production-rate cascade between data-entry grid and compute edge function (RCA: ₹7,511 mismatch May 2026)."
- `POLICY.md` → reinforce "Production rate cascade is computed by a single shared resolver. New call sites MUST import it; inline re-implementations are forbidden."
- Memory: append to `mem://features/incentive/production-rate-effective-dating` that grid + compute MUST share the resolver.

## Out of scope

- The "No KPIs / 0% PMS" cosmetic badge on a **production** programme (PMS doesn't gate production incentive; that's a separate UX cleanup if desired).
- The auto-`Finalised` status on freshly-computed rows (separate workflow concern).

## Rollback

Pure additive shared module + two call-site swaps. Revert = restore the inline `employeeRates` memo and the inline server cascade. No DB changes.
