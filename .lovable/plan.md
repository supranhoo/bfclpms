# Correct the persistent KPI rename preview failure

## Assumptions
- The reported failure is the red **Preview failed: invalid input value for enum review_status: "locked"** toast shown in the KPI group-definition rename panel.
- The correction must preserve the existing May 2026 freeze, role checks, audit trail, and approved/final-score immutability.
- No employee KPI, score, target, workflow status, or historical record should be changed merely by previewing.

## Confirmed RCA
The previous ADR-338 fix corrected the wrong preview function.

- The UI actually calls `public.correct_kpis_range_dry_run` from `useKpiRangeCorrection`.
- The deployed body of that RPC still evaluates `kpis.status IN ('locked', 'approved_by_manager')`.
- `kpis.status` is the `review_status` enum; neither `locked` nor `approved_by_manager` belongs to that enum, so PostgreSQL raises the exact error before returning preview counts.
- ADR-338 updated `preview_kpi_range_correction` and `correct_kpis_range`, but did not replace `correct_kpis_range_dry_run`.
- The regression test asserted only the two functions changed by ADR-338. It never inspected the RPC invoked by the UI, so the incomplete fix passed.

## Five Whys
1. **Why does Preview fail?** The called database RPC compares `review_status` to the invalid literal `locked`.
2. **Why is that invalid comparison still live?** The prior migration updated a similarly named preview RPC, not the `correct_kpis_range_dry_run` RPC used by the hook.
3. **Why was the wrong RPC selected?** The correction was based on matching function purpose/name instead of tracing the browser action through its actual client call.
4. **Why did tests not catch the mismatch?** The test inspected migration text for two named functions but did not assert the UI-to-RPC contract or the deployed body of the invoked function.
5. **Why could this recur?** Lock semantics are duplicated across multiple SQL functions and use two different status enums without a contract test covering all KPI rename entry points.

## Risk & Impact Report
- **Data impact:** Additive `CREATE OR REPLACE FUNCTION` migration only; no data backfill or row mutation. Preview remains read-only.
- **Workflow/permissions:** No role or RLS change. Admin/HR PMS preview access and admin-only apply access remain unchanged.
- **UI/UX:** No layout change. The existing Preview button will return per-month KPI, locked, and Org KPI counts instead of showing the enum error.
- **Regression risk:** Low for writes; moderate for lock-count parity if preview and apply use different predicates.
- **Scalability:** Preserve the bounded month/category/name query and grouped result; verify relevant query predicates and avoid loading row-level data into the UI.
- **Backup/data integrity:** No new table and no backup exclusion. Existing tables remain covered by automatic backup discovery.
- **Mitigation:** Use the same canonical lock predicate in dry-run and apply, add source-contract tests, and validate the deployed function after migration.
- **Rollback:** Reapply the prior function body only if necessary; because the change is function-only and non-destructive, no data rollback is required.

## Step-by-step Plan
1. **Replace the actual dry-run RPC**
   - Create a new migration replacing `public.correct_kpis_range_dry_run`.
   - Remove invalid `review_status` literals.
   - Define locked rows as `review_submissions.final_score IS NOT NULL OR kpis.status::text <> 'kra_set'`, matching the apply RPC.
   - Keep `STABLE`, `SECURITY DEFINER`, fixed `search_path`, authorization, date floor, range checks, and grouped output unchanged.

2. **Prevent preview/apply drift**
   - Audit all three rename RPCs and the hook call site.
   - Ensure preview counts and apply eligibility use identical lock semantics.
   - Do not change any status values or scoring data.

3. **Add regression coverage and realistic mocks**
   - Extend the rename lock test to assert the migration replaces `correct_kpis_range_dry_run`, the exact RPC called by the hook.
   - Cover `kra_set`, each valid post-`kra_set` review stage, final-score locking, invalid enum literals, an empty range, and mixed KPI/Org KPI counts.
   - Add/update fixture data representing editable, in-review, approved, and final-scored rows.

4. **Deploy and verify end-to-end**
   - Apply the migration and confirm the deployed function body contains no `locked`/`approved_by_manager` comparison against `kpis.status`.
   - Run targeted unit tests and the repository validation signal.
   - Reproduce Preview in the live app for the affected KPI/date range and confirm counts render without a toast.
   - Confirm Apply remains disabled until a successful preview and that preview itself changes zero rows.

5. **Synchronize governance documents**
   - Update `POLICY.md` so the canonical predicate explicitly covers every range-rename preview/apply RPC.
   - Update `DOCUMENTATION.md` with the corrected RCA, CAPA, exact UI-to-RPC mapping, validation results, rollback notes, and version-history entry.

## UI Changes
No visual redesign. Existing location, controls, responsive behavior, and interactions remain unchanged; only the Preview action's failed state is corrected.

## CAPA
- **Correction:** Replace the live `correct_kpis_range_dry_run` body.
- **Corrective action:** Align dry-run and apply lock predicates and verify the deployed definition.
- **Preventive action:** Test the actual hook RPC name and scan every range-rename function for cross-enum literals.
- **Detection control:** A regression test must fail whenever a UI-invoked rename RPC is absent from the migration or contains `kpi_status` literals in a `review_status` comparison.
