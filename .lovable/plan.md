# ADR-224 — Bulk criterion exemption + configurable exemption penalty rule

## Goal
Two additions on top of ADR-221/222/223:
1. **Bulk exempt** every employee who failed eligibility *only* because of one chosen criterion, with an admin-set threshold (e.g. "absent days up to 10").
2. Make the **exemption penalty** a configurable master rule — instead of only "clamp to the highest non-top-N tier", support "**step the employee down N slabs**", and only apply it when the employee lands in the top slabs.

Plus a **transparent record** so the employee (and reviewers) can see which criterion was exempted and exactly how it changed their slab.

## Assumptions
- Bulk exemption is admin / HR PMS / management only, run from the Bell Curve Analysis tab of the Annual Review Report, scoped to the selected cycle.
- It only exempts criteria the master policy marks exemptable (`annual_review_eligibility_exemption_policy`); protected rows (disciplinary, tenure, month completion) can never be bulk-exempted — the existing `ar_elig_exemption_guard()` stays the server authority.
- Rating bands and the bell-curve distribution stay untouched; the penalty is a slab-percentage overlay only (ADR-221 decision A remains).

## Risk & Impact
- **Data:** additive only — new columns on `annual_review_bell_curve_config` and on the exemptions table, plus one new bulk-run table. Rollback = drop them.
- **Workflow:** a bulk run can flip many employees from Ineligible to Exempted at once. Mitigated by a mandatory dry-run preview, an explicit reason, per-row provenance (`source = 'bulk'`, `bulk_run_id`) and one-click **undo of the whole run**.
- **UI:** new dialog + new settings block; existing screens gain a "how this was applied" popover and one extra column. No layout rework.
- **Regression:** slab maths is centralised in `ratingSlab.ts` / `effectiveEligibility.ts`. Changing the cap into a rule object could alter existing capped values — mitigated by keeping `top_tiers_excluded` as the default mode so current behaviour is byte-identical unless an admin switches mode, with the existing 17 tests kept green.
- **Scalability:** a cycle is a few thousand instances. Apply runs server-side in one SECURITY DEFINER RPC over the cycle; the preview grid is paginated (50/page) like the existing drill-down.

## 1. Configurable exemption penalty rule
Extend the existing cycle-scoped master data (`annual_review_bell_curve_config`, which already holds `exempted_slab_cap_enabled` / `exempted_top_tiers_excluded`):

| Field | Meaning |
| --- | --- |
| `exempted_penalty_mode` | `none` / `top_tiers_excluded` (current behaviour, default) / `step_down` |
| `exempted_step_down_slabs` | how many slabs to drop (1 or 2, default 1) — used by `step_down` |
| `exempted_penalty_min_slab_rank` | apply the penalty **only** when the employee's slab is within the top N slabs (default 2); below that, no penalty |

`step_down` example with the seeded bands: 20% → 16% (1 down) or 12% (2 down); an employee already at 8% with `min_slab_rank = 2` keeps 8%.

Implementation: replace the `slabCapPercent` call inside `effectiveSlabPercent()` with a new `applyExemptionPenalty(computedPercent, slabs, rule)` in `src/lib/annualReview/ratingSlab.ts` returning `{ percent, applied, mode, from, to }`. `slabCapPercent` stays exported for the legacy mode. Everything downstream (report grid, drill-down, exports) already goes through `effectiveSlabPercent`, so no call-site logic changes — only the extra explanation object where we surface it.

UI: the rule editor goes into the existing **Bell Curve settings dialog** (`BellCurveConfigDialog.tsx`) as an "Exemption penalty rule" block with a live preview line: *"20% → 16% (1 slab down)"*.

## 2. Bulk exemption by criterion
New **`BulkExemptionDialog.tsx`**, launched from a "Bulk exempt" button in the Bell Curve Analysis toolbar (admin / HR PMS / management only):

```text
Criterion   [ Absent Days            v ]   (only exemptable criteria)
Condition   actual <= [ 10 ]               (numeric) / equals [ value ] (text/boolean)
Scope       [x] Only employees whose ONLY blocking failure is this criterion
            [ ] Include employees with other blocking failures (they stay Ineligible)
Reason      [ FY26 attendance relaxation approved by ... ]
            [ Preview ]  -> matched employees, before/after slab
            [ Apply exemption to 42 employees ]
```

- **Preview** is computed with `resolveEligibility()` over data already loaded for the tab, so preview numbers match the grid exactly. Columns: Employee, Criterion actual, Current status, Slab now, Slab after (with penalty), Δ.
- **Apply** calls a new SECURITY DEFINER RPC `bulk_exempt_eligibility_criterion(p_cycle_id, p_criterion_key, p_threshold, p_operator, p_only_sole_failure, p_reason)` which re-evaluates server-side (never trusts the client list), refuses non-exemptable criteria, upserts `annual_review_eligibility_exemptions` rows with `status = 'approved'`, `source = 'bulk'`, `bulk_run_id`, and returns per-row results.
- **Undo:** each run writes a header row to the new `annual_review_bulk_exemption_runs` table; a "Runs" section lists past runs with counts and a `ConfirmDestructiveDialog`-guarded **Revoke run** action that deletes only that run's exemptions.

## 3. Transparency record
- New columns on `annual_review_eligibility_exemptions`: `source` (`manual` | `bulk`), `bulk_run_id`, `penalty_applied`, `penalty_from_percent`, `penalty_to_percent`, `penalty_note` — written at apply time so the impact is frozen even if the rule later changes.
- New shared **`ExemptionImpactPopover.tsx`**: *"Absent Days waived (12 days, limit 10). Exemption penalty: 1 slab down — 20% → 16%."* Shown on the Exempted badge in the Bell Curve drill-down (`BandEmployeeList.tsx`), in the Annual Review Report grid, and on the employee's own review page so the affected person sees why.
- Exports (report CSV and drill-down CSV) gain `Exemption Source`, `Exempted Criteria`, `Exemption Penalty` columns.
- Every bulk run and revoke is audited (actor, filters, counts, before/after totals) as JSONB on the runs table.

## Technical notes
- Migration (one call): add the 3 config columns and the 6 exemption columns; create `public.annual_review_bulk_exemption_runs` with GRANTs + RLS (read: admin/hr_pms/management; writes via RPC only); create `bulk_exempt_eligibility_criterion()` and `revoke_bulk_exemption_run()` as SECURITY DEFINER with `set search_path = public`; extend `ar_elig_exemption_guard()` to accept the bulk source while still rejecting non-exemptable criteria.
- Files touched: `ratingSlab.ts`, `effectiveEligibility.ts`, `useBellCurveConfig.ts`, `useEligibilityExemptions.ts`, `BellCurveConfigDialog.tsx`, `BellCurveTab.tsx`, `BandEmployeeList.tsx`, `AnnualReviewReport.tsx`, `TeamReviewDetailContent.tsx`; new `BulkExemptionDialog.tsx`, `ExemptionImpactPopover.tsx`, `src/services/annualReview/bulkExemption.ts`.
- Tests: extend `src/test/annualReview/effectiveEligibility.test.ts`, add `bulkExemption.test.ts` — step-down maths, min-slab-rank guard, sole-failure matching, non-exemptable rejection, penalty explanation text, undo restores prior status.
- Docs: ADR-224, POLICY §AR-ELIGIBILITY-EXEMPTION items 8–10, DOCUMENTATION.md version history, memory update.