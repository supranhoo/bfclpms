# Fix Jitendra Bharti Eligibility Data and Missing-State Classification

## 1. Assumptions

- The uploaded row for employee **101715 — Jitendra Bharti** is the correction source: Absent Days `0`, LWP Days `0`, Disciplinary Actions `false` (uploaded as `0`), and 6-Month Completion `7` months (uploaded as `7 Months`).
- The correction applies only to the active **2025–2026** annual-review instance and must not change its completed workflow stage or final score.
- The employee profile currently derives `11` months from its stored DOJ, while the uploaded workbook explicitly supplied `7 Months`. This change will preserve the explicit uploaded eligibility answer and will not alter DOJ.

## 2. Clarifications

Not Applicable. The uploaded values and affected review are identifiable. The DOJ discrepancy will be reported but not silently changed.

## 3. RCA and 5-Why Summary

### Confirmed current state

- The live completed instance has `eligibility_inputs = {}`.
- Its effective template contains four eligibility criteria.
- `SystemScoresPanel` correctly presents missing answers as **Eligibility inputs pending**.
- `resolveEligibility`, used by the admin Final Outcome card and reports, currently treats every missing answer as a failed criterion and therefore shows **Ineligible** with a `0%` slab.
- ADR-239 created an audited correction route, but no correction audit exists for this employee; the original values were never applied.

### Five Whys

1. Why does the card show Ineligible? The resolver receives four missing answers and classifies each as a failure.
2. Why are the answers missing? The bulk upload did not persist eligibility values on the completed review.
3. Why did the previous fix not change the display? It added an opt-in correction mechanism but did not backfill this already-affected instance.
4. Why is the UI contradictory? The System Scores panel distinguishes pending from failed, while the effective eligibility resolver does not.
5. Why was this not caught? Existing tests explicitly expect a missing answer to be Ineligible and ADR-239 tests only cover warnings/`n/a`, not successful locked-review correction or post-correction eligibility.

## 4. Risk & Impact Report

- **Data impact:** One audited additive JSON correction on the existing instance. No schema deletion, status change, score rewrite, or historical-row removal.
- **Workflow impact:** None; the review remains Completed. Correct eligibility should change the effective status from Ineligible to Eligible and restore the rating-derived slab.
- **RLS/security:** Use the existing admin/HR-PMS-only correction function; do not bypass RLS with a raw client update. Verify the audit entry records actor, reason, and before/after values.
- **UI/UX impact:** Missing eligibility values will display as **Not assessed / Inputs pending**, not as a red policy failure. Genuine entered failures remain Ineligible. The Final Outcome card will clearly list missing criteria when incomplete.
- **Regression risk:** Reports, Bell Curve placement, heat maps, exports, and increment slab calculations consume the same resolver, so changing missing-state semantics affects all consistently. Tests will cover complete, incomplete, and genuinely failing inputs.
- **Scalability:** Pure O(number of criteria) resolver logic; no added queries or unbounded client fetches.
- **Backup/data integrity:** No new table. The existing instance and audit tables remain covered by automatic public-table backup discovery.
- **Rollback:** Restore the instance’s prior eligibility JSON from the audit entry and revert the resolver/UI commit. No destructive migration is required.

## 5. Step-by-Step Plan

1. **Correct the affected data through the governed path**
   - Apply `{ absent_days: 0, lwp_days: 0, disciplinary_actions: false, elig_g3dbsuv: 7 }` to Jitendra’s identified 2025–2026 instance with a specific correction reason.
   - Verify the stored JSON, unchanged `overall_status = completed`, unchanged `total_score = 90.70`, and the new audit record.

2. **Fix the shared eligibility state model**
   - Extend `EffectiveEligibility` to expose missing criteria separately from failed criteria.
   - Return `unknown` whenever one or more required answers are absent, unless a supplied answer genuinely fails; never label an all-empty record Ineligible.
   - Keep approved exemption, protected criterion, penalty, and true failure behavior unchanged.

3. **Align the review detail UI**
   - Make `AdminFinalOutcomeCard` show **Not assessed** with an explicit “eligibility inputs pending” list when required values are missing.
   - Merge the existing deterministic tenure auto-input consistently where display-only eligibility is evaluated, without overwriting a manually stored value.
   - Invalidate/refetch the instance and Final Outcome queries after eligibility save/correction so the badge changes immediately.

4. **Harden bulk import typing and successful correction coverage**
   - Parse eligibility values according to the template criterion type: numeric text such as `7 Months` → `7`, and boolean forms such as `0/No/false` → `false`.
   - Reject ambiguous values with a named per-cell error rather than saving malformed data or silently dropping it.
   - Preserve the existing locked-review opt-in, reason requirement, and audited RPC.

5. **Verify every affected surface**
   - Confirm Jitendra’s System Scores eligibility table shows `0`, `0`, `No`, `7`, all met.
   - Confirm Final Outcome shows **Eligible**, effective rating `4.54 / 5`, and the configured rating-based slab rather than `0%`.
   - Confirm Annual Review Report, Bell Curve/heat map, and Excel export resolve the same effective eligibility.

## 6. UI Changes

- **Location:** Annual Review detail → System Scores and Admin-only Final Outcome card.
- **Visual change:** Empty criteria use neutral pending/not-assessed styling; only entered policy failures use destructive Ineligible styling.
- **Interaction:** Saving/correcting eligibility refreshes the detail immediately.
- **Responsiveness:** Existing responsive card/table layouts remain unchanged; pending criterion names wrap within the current container.

## 7. Tests

- Update resolver tests: all missing → unknown; partially missing with no entered failure → unknown; entered failure plus missing → ineligible with missing tracked separately; all passing → eligible.
- Add bulk parser tests for `7 Months`, `0`, `No`, malformed numeric text, and locked completed correction routing.
- Add component coverage proving the System Scores panel and Final Outcome card agree on pending versus failed states.
- Add a realistic mock for Jitendra’s four criteria and uploaded values.
- Run focused annual-review eligibility, report-rating, Bell Curve placement, and bulk-upload tests.

## 8. DOCUMENTATION.md Updates

- Record the corrected three-state eligibility contract: pending/not assessed, eligible, and ineligible.
- Document the one-time governed repair, explicit uploaded-value precedence, typing rules, audit verification, and version-history entry.

## 9. POLICY.md Updates

- Amend the eligibility SSOT policy so missing inputs are never treated as policy failures.
- Require typed bulk normalization and explicit errors for unparseable eligibility values.
- Preserve the protected no-exemption rules for disciplinary action and tenure.

## 10. Post-Implementation Notes

- Report the authenticated admin correction path and stored audit evidence separately.
- Report the DOJ discrepancy (uploaded 15-Nov-2025 versus stored 25-Jul-2025) without changing profile data.
- Confirm the exact stored values, final eligibility, slab, unchanged final score, and unchanged completed stage.