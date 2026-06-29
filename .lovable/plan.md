## Assumption
Source code at `supabase/functions/compute-monthly-incentives/index.ts` is correct (paginated, ADR-094 confirmed in repo at lines 317, 350, 401). The preview still shows `Employees with daily data: 1000` (exact cap) and `Total ₹3,10,983 / 201 records`, which is the pre-ADR-094 fingerprint — the deployed edge function build is stale.

## Risk & Impact Report
- **Data Impact:** None on schema. `Confirm & Compute` performs delete-then-upsert on `employee_incentive_records` for (program, month) — already idempotent.
- **Workflow Impact:** None. Confirm flow unchanged.
- **UI Impact:** None. Diagnostics strip will read `~2412 / ₹3,98,134 / 280 records` after redeploy + re-open.
- **Regression Risk:** Low. Redeploy ships code already pinned by `computeMonthlyIncentivesPagination.test.ts`.
- **Mitigation:** Verify the diagnostics number changes from `1000` to the true count before Upendra clicks Confirm.

## Plan
1. **Redeploy** `compute-monthly-incentives` edge function (no code change — source is already correct).
2. **Verify** via Upendra: hard-refresh `/reports/incentive`, re-open the Metal Sizing / June 2026 preview. Expected: `Employees with daily data: ~2412`, `Total Amount ₹3,98,134`, `201 → 280 records`.
3. **If still 1000 after redeploy** → fall through to RCA-2: probable cause is a second non-paginated read path (e.g. the production-period grouping or override probe), or a wrapper service caching results. Add a `console.log('build-stamp', new Date().toISOString())` at function top so we can confirm in `edge_function_logs` which build is serving.
4. **No documentation change** — ADR-094 already captures the fix. Add a one-line note to `DOCUMENTATION.md` v2.66.64 release log: "Redeployed compute-monthly-incentives — production preview was serving stale pre-ADR-094 build."
5. **Mark Paid / Confirm & Compute** only after step 2 verification.

## UI Changes
None.

## Tests
Existing `src/test/computeMonthlyIncentivesPagination.test.ts` already pins the contract. No new tests needed for a redeploy.

## Rollback
Redeploy is a no-op rollback target — previous build is the currently-serving one. If the new build misbehaves, redeploy from the prior git SHA.

## Post-implementation
After confirmed match (₹3,98,134), close the loop with Upendra and instruct him to re-run Confirm & Compute to replace the 201 stale `employee_incentive_records` with the corrected 280.
