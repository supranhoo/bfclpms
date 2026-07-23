
# Incentive Data Entry vs Report mismatch — Metal Sizing / Bihar Foundry / 11-20 / July 2026

Employee: Akash Rajvanshi (200631)

## Evidence (from DB, no changes made)

`employee_incentive_records` rows for Akash · July 2026 · Metal Sizing:

| payment_period | production_value | incentive_amount | base % | final % | status    | last updated       |
|----------------|------------------|------------------|--------|---------|-----------|--------------------|
| 1-10           | 6                | ₹2,943.72        | 0      | 0       | confirmed | 2026-07-15 11:41   |
| 11-20          | 4                | ₹1,962.48        | 0      | 0       | confirmed | 2026-07-23 08:03   |

`production_daily_entries` for Akash · July 2026 (unique row, last edited 2026-07-13):
```
{"6":2,"7":1,"8":1,"9":1,"10":1,"11":1,"12":1,"13":1,"16":1}
```
So the *current* daily grid values sum to: 1-10 → 6, 11-20 → 4, 21-31 → 0 — but the user says the Data Entry grid for 11-20 is now 0 for this employee. That means the daily-values field for 11-20 was reduced to zero at some point after 2026-07-23 08:03 and Recompute was rerun, yet the 11-20 record with ₹1,962.48 is still in the report.

## Root Cause (5 Whys)

1. **Why does the Report show ₹1,962 while Data Entry shows 0?**
   Report reads `employee_incentive_records`; a stale "confirmed" row with `production_value=4, incentive_amount=1962.48, payment_period='11-20'` is still there.

2. **Why did Recompute not overwrite / clear that stale row?**
   `supabase/functions/compute-monthly-incentives/index.ts` gates the *delete-existing* block on `if (scopedRecords.length > 0)` (line 885). When the corrected daily values make the 11-20 sub-period sum to 0, the loop at line 742 (`if (total > 0) rangeTotals.push(...)`) emits **no** record for 11-20. `scopedRecords` becomes empty → the delete step is skipped → the previous confirmed row survives.

3. **Why does the sub-period loop skip zero totals?**
   By design "no record per empty sub-period" — but that assumption breaks the delete-before-upsert contract (**ADR-044 v2**) when a period *was previously populated* and later corrected to zero.

4. **Why did the "confirmed" status not prevent this in the first place?**
   The compute function currently deletes even confirmed rows when it does run; there is no interlock keeping confirmed/paid rows sacrosanct, and no zero-out path either. Confirm is a UI decoration only.

5. **Why did QA not catch it earlier?**
   No test covers the "previously non-zero → now zero" recompute scenario at sub-period grain. `computeMonthlyIncentivesPagination.test.ts` only asserts non-empty paths.

**Cause classification:** Logic bug in compute function (delete-before-upsert scope) + policy gap on confirmed/paid row lifecycle.

## Risk & Impact Report

- **Data impact:** Only stale `employee_incentive_records` rows for zeroed sub-periods; underlying daily entries are correct. Bihar Foundry / Metal Sizing / July 2026 / 11-20 is one confirmed occurrence; a scan across all production programmes may reveal more.
- **Workflow impact:** None — recompute path is unchanged for the "still has production" case.
- **UI impact:** None (backend fix + one-shot cleanup).
- **Regression risk:** Low. The added delete is scoped exactly to `(program_id, review_period, review_year, employee_batch, scopePaymentPeriod?)` — identical to today's delete filter.
- **Mitigation:** Add unit tests covering zero-out at sub-period grain; run cleanup as an audited data-repair with before/after logging.

## Fix Plan (CAPA)

### Corrective (data)
1. **Detect** all `employee_incentive_records` rows for production programmes whose current `production_daily_entries` sum for that `payment_period` is `0` (or missing) while `production_value > 0` on the record. Log to a new `incentive_stale_zero_cleanup_audit` table (id, employee, program, period, year, payment_period, old production_value, old incentive_amount, old status, cleaned_at).
2. **Delete** those stale records (or set `production_value=0, incentive_amount=0, base=0, final=0, status='draft'` — decision below in Open Question).

### Preventive (code — ADR-141: "Zero-out sub-period recompute")
1. `supabase/functions/compute-monthly-incentives/index.ts`
   - Move the delete-existing block **out** of the `if (scopedRecords.length > 0)` guard.
   - Compute `affectedEmployeeIds` from the input roster (all employees the compute call considered), not from `scopedRecords`, so zeroed employees still get their stale rows purged.
   - Keep the scope filters exactly as today: `program_id`, `review_period`, `review_year`, `employee_id IN batch`, and `payment_period = scopePaymentPeriod` when provided.
2. Emit diagnostics `zeroed_periods_cleaned` count in the compute response for auditability.
3. Policy update — **POLICY §INCENTIVE-COMPUTE-DELETE-INVARIANT**: "Every compute run MUST purge the scoped `(program, period, year, employees, payment_period?)` slice before upsert, regardless of whether the new record set is empty. A zero-total sub-period MUST NOT leave a prior record behind."

### Regression protection (tests)
- `src/test/computeMonthlyIncentivesZeroSubPeriod.test.ts` — covers the exact case: prior row present, daily values updated so 11-20 sums to 0, recompute → row is gone.
- Extend `computeMonthlyIncentivesPagination.test.ts` to assert delete runs on empty-record path.

### Documentation
- Update `DOCUMENTATION.md` "Incentive Compute" section with the new invariant and ADR-141.
- `POLICY.md` §INCENTIVE-COMPUTE-DELETE-INVARIANT (see above).

## Open Question (need your call before I switch to build)

Confirmed/Paid record lifecycle when the underlying daily values are zeroed *after* confirmation:

**Option A — Hard delete** the stale row (matches current compute semantics, simpler).
**Option B — Preserve as `status='draft'` with amount 0** (keeps a paper trail that the period was ever populated; needed if audit requires seeing "this was once ₹1,962").
**Option C — Preserve for `status IN ('paid')` only**; hard-delete `draft`/`confirmed`. Recommended default because paid rows likely tie to disbursement records.

Please pick A / B / C, and I'll finalize the migration + edge-function patch + tests in build mode.

## Rollback strategy
- Edge-function change is a single-file patch; revert to previous version if needed.
- Data cleanup writes to `incentive_stale_zero_cleanup_audit`, so any deletion can be re-inserted from the audit table.
