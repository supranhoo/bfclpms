# Why the TNI Report Shows Zeros

## Root Cause (RCA)

The report itself is working correctly — the **database has no Training Needs records for Sep / Oct / Nov 2025**, which are the months your filter is currently covering.

I verified the `training_needs` table directly. Detection has been run for these periods only:

| Period | Skill Gaps | Compliance | High Priority |
|---|---|---|---|
| Dec 2025 | 266 | 0 | 212 |
| Jan 2026 | 341 | 0 | 282 |
| Feb 2026 | 404 | 0 | 363 |
| Mar 2026 | 168 | 121 | 239 |
| **Jul–Nov 2025** | **0** | **0** | **0** |

So when your filter (single-month, QTD, YTD, AY, or custom) resolves to a window that includes **Jul–Nov 2025**, the Monthly Summary sheet correctly emits zero rows for those months — because nothing was ever detected for them.

## Why this happens

TNI records are not generated automatically every month. They exist only for periods where someone clicked **"Detect TNI"** on this page (or the equivalent admin action). Earlier months in your AY (Jul–Nov 2025) were never detected, so the table is empty for them and every aggregation (cards, category, department, monthly export) reads as `0`.

## Two Things I Recommend Doing

### A. Immediate (you, no code change)
Click **"Detect TNI"** once for each missing month (Jul, Aug, Sep, Oct, Nov 2025). The page already supports this — switch period mode to **Month**, pick the month, click Detect. Data will populate.

### B. Code improvements I will ship

1. **Empty-period banner** on the report: when the selected range contains months with zero TNI records but those months *do* have submitted KPIs, show an inline alert:
   *"No TNI data detected for Jul, Aug, Sep, Oct, Nov 2025. Click 'Detect TNI' for each month, or use 'Backfill Range' below to run detection in bulk."*

2. **Backfill Range button** (visible only in multi-month modes — QTD, YTD, AY, Custom): a single action that loops through every month in the active range and runs `detect_training_needs_for_period` for each. Progress toast: *"Detecting 5 / 12 months…"*. This eliminates the manual month-by-month clicking.

3. **Monthly Summary sheet — annotate empty months**: in the Excel export, append a final column **"Detection Status"** with values `Detected` or `Not detected — run TNI detection`, so the zero rows are unambiguous and not mistaken for "no skill gaps".

4. **Documentation & Policy sync**:
   - `DOCUMENTATION.md` (v2.66.7.31): document that TNI is on-demand, list the detection contract, and add the new Backfill Range action.
   - `POLICY.md`: add a clause requiring that any month with closed/approved KPIs SHOULD have TNI detection run before reporting cycles close.

5. **Regression test** (`bugBountyFixes.test.ts`, `BUG-029`): assert that when `useTNISummary` is called for a period with no `training_needs` rows, totals are `0` and the UI surfaces the empty-state alert (not silently zeros).

## Files to change

- `src/pages/reports/TNIReport.tsx` — empty-state banner, Backfill Range button + handler, export annotation column
- `src/hooks/useTNI.ts` — `useBackfillTrainingNeeds` mutation that iterates `periodRanges` and calls the existing RPC per month
- `src/test/bugBountyFixes.test.ts` — BUG-029
- `DOCUMENTATION.md`, `POLICY.md` — sync

## Risk & Impact

- **Data**: No schema changes. Backfill only inserts via the existing, idempotent `detect_training_needs_for_period` RPC.
- **Workflow**: Adds one new admin action; existing single-month Detect button is unchanged.
- **UI/UX**: One alert + one new button in multi-month modes only; no layout disruption.
- **Regression**: Low. New code paths are gated behind `isMulti`.
