
## Assumptions

- "Incentive Data Entry's Sum" = the **Page Total** line at the footer of `ProductionDailyGrid` (`₹{pageTotal}`), not the **Grand Total / Filtered Total** next to it.
- "Incentive Report" total = `summaryStats.totalAmount` in `MonthlyIncentiveTable`, which sums `employee_incentive_records.incentive_amount` for the selected period/company.
- BFCL is selected via the Company filter in both screens; period = June 2026; program = Metal Sizing (the only daily program with June 2026 entries).

## RCA — verified against the database

DB confirms the report is correct and the **whole grid total also matches the report**. The mismatch is a UI labelling problem, not a data problem.

| Source | Value | Origin |
|---|---|---|
| Incentive Report — BFCL, June 2026 | **₹270,332** | 218 records × `incentive_amount` (production 551 t × company rate 490.62) |
| Data Entry — Grand Total (BFCL filter) | **≈ ₹270,332** | 123 BFCL employees × tons (551) × 490.62 |
| Data Entry — **Page Total** (page 1, page size 50 of 123) | **≈ ₹109,654** | 50 visible rows × ~4.47 t avg × 490.62 |

Math: 109,654 / 490.62 = 223.5 t; 223.5 / 551 = **40.6 %** → that is exactly 50/123 of the BFCL roster, i.e. one page of the default 50-row pagination.

So the number the user is reading is the **per-page** subtotal, not the program total. The Grand Total ribbon two columns to its right already shows ~₹270,xxx that matches the report.

Verification path (run after deploy): toggle page size to "All" or page through every page — Page Total cumulates to Grand Total, which equals the report.

## Risk & Impact Report

- **Data Impact:** None. Numbers in DB are already consistent (verified).
- **Workflow Impact:** None. Save behavior, computation, and edge function unchanged.
- **UI/UX Impact:** Footer summary becomes self-explanatory; users stop confusing per-page subtotal with the program total.
- **Regression Risk:** Very low — pure presentation changes in one file (`ProductionDailyGrid.tsx` lines 481–492). No data, hook, or query changes.
- **Scalability:** Unchanged. Same memoised reductions, same paginated render.
- **Mitigation:** Add a unit test for the existing `getTotal` / aggregation helpers' parity with the per-page slice (Grand Total = Σ Page Totals across all pages); manual screenshot QA at default page size.

## UI Changes (only file: `src/components/incentive/ProductionDailyGrid.tsx`)

1. **Reorder & re-weight the footer:** show **Grand Total / Filtered Total** first and largest (primary text, bold, larger font), with the **company name in the label** when a company filter is active (e.g. *"Grand Total — BFCL: ₹2,70,332"*).
2. **De-emphasise Page Total** as a secondary muted line: *"This page only (50 of 123): ₹1,09,654"*; auto-hide when `totalPages === 1`.
3. **Add an info tooltip** (`Info` icon next to Page Total) explaining: *"Page Total covers only the rows visible on this page. Grand Total covers every employee matching your current filters and is what the Incentive Report sums."*
4. **Sticky parity badge** next to Grand Total: when a Company filter is active and a record set exists in `employee_incentive_records` for the same program/period/company, fetch its sum and display *"Matches Report ✓"* (green) or *"Differs from Report — recompute pending"* (amber) with the delta. The check is read-only against the records table.
5. **Responsive:** footer wraps to a stacked two-row layout below `sm` so the Grand Total never gets clipped on mobile.

No new pages, routes, or tabs. No touch to header, body, or save flow.

## Plan (step → verification)

1. **Footer refactor** in `ProductionDailyGrid.tsx` → screenshot at default (page 1) BFCL filter shows Grand Total prominent; Page Total muted.
2. **Add `useIncentiveReportParity` hook** (`src/hooks/useIncentiveReportParity.ts`) — single `select sum(incentive_amount)` from `employee_incentive_records` for `(program_id, review_period, review_year, company_id)`, paged via `fetchAllPaged`. Hook returns `{ recordsTotal, isLoading, hasRecords }`.
3. **Wire parity badge** → verify by toggling company filter (BFCL ⇄ All) and confirming the badge shows ✓ for BFCL=June 2026.
4. **Unit tests** (`src/test/productionDailyGridFooter.test.ts`):
   - `pageTotal` ≤ `filteredGrandTotal` for any `pageIndex`, `pageSize`, filter combination.
   - Sum of `pageTotal` across all pages == `filteredGrandTotal` (no rounding drift > ₹1).
   - Parity badge label correctly computes delta and rounds to nearest ₹.
5. **DOCUMENTATION.md** → add `v2.66.46 — Page Total vs Grand Total clarity + Incentive Report parity badge` entry with the RCA, the math (50/123 page-slice → 40.6 % under-report), and the UI change list.
6. **POLICY.md** → extend `§INCENTIVE-MAPPING-PAGING` with a **Display-vs-Data invariant**: "Any paginated incentive grid MUST surface a Grand Total computed over the full filtered roster, labelled distinctly from Page Total. Where `employee_incentive_records` rows exist for the same scope, a parity indicator MUST be shown so users see whether a recompute is pending."

## Files

- **Edit:** `src/components/incentive/ProductionDailyGrid.tsx`, `DOCUMENTATION.md`, `POLICY.md`
- **Add:** `src/hooks/useIncentiveReportParity.ts`, `src/test/productionDailyGridFooter.test.ts`

## Out of scope (push-back per Rule 15)

- Auto-running the compute edge function from the grid — destructive side-effect, must remain explicit on the Report screen.
- Removing pagination or raising the default page size — would re-introduce the 80k-input render bottleneck fixed in v2.66.44.
- Changing how records are written by `compute-monthly-incentives` — DB is already correct, no behavioural change warranted.

## Rollback

Revert the single component patch and delete the two new files; no schema or RPC changes.
