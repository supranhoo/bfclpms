

## Plan: Fix "0 Records Processed" When Filtering by Period (1-10 / 11-20 / 21-31)

### RCA — Two Real Defects (verified against DB)

**Verified facts for Saibal Kunar / Metal Sizing / April 2026:**
- 69 employees match the Company filter ✓
- All 69 have entries in `production_daily_entries` ✓
- Of those 69, **only 3 employees have any value in days 1-10**; the other 66 have entries only in days 11-31

**Defect A — Period filter wipes out 66 of 69 employees silently**
The edge function (lines 600-676) splits each employee's daily values into ranges and **skips a range whenever total = 0** (line 618: `if (total > 0) rangeTotals.push(...)`). Then at line 707 it filters records by `payment_period === '1-10'`. Result: 66 employees produce no `1-10` row → discarded → only 3 records should remain.

**Defect B — UI says "0 processed" but DB now has 3 rows orphaned mid-month** (suspected)
The toast in screenshot 702 says **"0 record(s) processed"**. That is wrong if 3 rows were written. Either:
- The 3 employees got disqualified before reaching the records loop (DQ rules can short-circuit), OR
- `prodDailyMap` was filled but the `populatedRanges` filter dropped them due to a numeric-parse edge case (e.g., values stored as objects, not strings).

Either way, the **user-facing message is misleading** because it doesn't distinguish between "no employees matched scope" vs "all matched but all filtered out by sub-period".

**Defect C — Inconsistent company resolution between UI and edge function** *(latent, surfaced here)*
- UI's `useCompanyFilter` resolves company via `profiles.company_id` **OR** dept→BU→division→company chain (whichever is set first). Saibal Kunar's 217 employees use direct `profiles.company_id`.
- Edge function's mapping resolution uses **only the dept→BU→division→company chain** (line 82-107) — never reads `profiles.company_id`. For programmes mapped by company/division this would give different results than the UI.
- For this specific case it's harmless (mappings are by department/grade, not company), but it's a divergence that will bite later.

### Fix

#### A. Make the empty-result message diagnostic
**File: `supabase/functions/compute-monthly-incentives/index.ts`**
- After scope filter (line 707), compute a diagnostic summary:
  - `employees_processed` = `employees.length`
  - `records_pre_scope` = `records.length`
  - `records_post_scope` = `scopedRecords.length`
- Return them in the response and a clear message:
  - If `records_pre_scope === 0`: *"No production data found for selected employees in {month} {year}"*
  - If `records_pre_scope > 0 && records_post_scope === 0`: *"No production entries fall in period {payment_period}. {employees_with_other_periods} employee(s) have data in other periods (11-20 / 21-31). Switch the Period filter to view them."*
- Surface this `message` in the existing toast (already wired through `useComputeIncentives`).

#### B. Frontend — show diagnostic on toast & empty-state
**File: `src/hooks/useIncentiveRecords.ts` (`useComputeIncentives.onSuccess`)**
- When `data.computed === 0`, show the server-supplied `data.message` as the toast description instead of generic "0 record(s) processed".

**File: `src/components/incentive/MonthlyIncentiveTable.tsx`**
- Pre-flight check before invoking compute: if `periodFilter !== 'all'`, show an info chip in the empty-state: *"Period filter is set to {1-10}. Compute will only write rows where employees have production data in that range."*
- Add a "Compute for All Periods" secondary button when periodFilter ≠ 'all', which calls compute with `payment_period: null` so the user can recover with one click.

#### C. Align company resolution (defensive parity)
**File: `supabase/functions/compute-monthly-incentives/index.ts`**
- Extend the dept→BU→company chain block (lines 278-297) to also build an `empToCompanyDirect = Map<emp_id, company_id>` from `profiles.company_id`.
- In slab-scope match (line 398-400), prefer `empToCompanyDirect.get(emp.id) ?? <chain-resolved>`.
- This is purely defensive — current bug doesn't depend on it but it removes the UI/edge-function divergence permanently.

### Files Touched
| File | Change |
|---|---|
| `supabase/functions/compute-monthly-incentives/index.ts` | Diagnostic counters + clear `message` in 0-result response; honour `profiles.company_id` in scope chain |
| `src/hooks/useIncentiveRecords.ts` | Surface `data.message` in toast when `computed === 0` |
| `src/components/incentive/MonthlyIncentiveTable.tsx` | Empty-state warning when period filter is active; "Compute for All Periods" recovery CTA |

### Risk & Impact
| Area | Impact |
|---|---|
| Data | None — only adds counters & message; computation logic unchanged |
| Workflow | None — recovery CTA is opt-in |
| UI/UX | Users immediately see *why* zero rows were processed and how to recover |
| Regression | Very low — purely additive |
| Mitigation | Existing scope-filter behaviour preserved verbatim; only the messaging and a diagnostic summary are added |

### Out of Scope
- Auto-relaxing the period filter on compute (keeps user's intent explicit)
- Backfilling production data for missing days (data-entry concern, not compute)
- Migrating existing "Full Month" records into split-period rows retroactively

