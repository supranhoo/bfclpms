# Why "Final Rating (out of 5)" is blank for those employees — and how to fix it

## What I found (verified against the live data)

The report is not dropping the values — the underlying instances have **no final score stored**.

For the 2025-2026 cycle:

| State | Count |
| --- | --- |
| Completed instances with a final score | 2,073 |
| **Completed instances with no final score** | **13** |
| Excluded instances (score not expected) | 493 |

All ten employees in your screenshot (100264 Sajid Raza, 101148 Jitendra Kumar Dwivedi, 200301 Anil Kumar Pathak, 100367 Yogesh Trikha, 100012 Nitesh Kumar Baldwa, 100856 Abhas Luharuwalla, 200271 V.A.V.S.S. Ganapathi Varma, 100894 Parshu Ram Shukla, 101773 Dippendu Das, 100513 Arun Goswami) are in that 13. Their reviews read **Completed** and are **finalized**, but the stored final score and stored rating are both empty.

Because Final Rating (out of 5) = final score / 20, an empty final score produces an empty rating; Computed Rating, Calibrated Rating, Slab % and the Rating band go blank for the same reason. The export logic itself is correct.

## Why the score is empty

- 12 of the 13 sit on the KRA-driven template **"Generic M - (With KRA)"**: their criteria score is 0 (reviewers never score per criterion on that template) and the whole score lives in the KRA system-score slot — which **is** populated (e.g. 100012 = 91.74, 100264 = 40.93, 100367 = 90.61).
- Running the scoring function against these instances today returns a valid score for all 13. So the score is computable; it was simply never written back to the instance.
- The exact operation that skipped the write-back is not yet confirmed. Likely candidates: a KRA rehydrate or system-score correction run that updated the system scores without recomputing the instance total. Confirming this is step 1 — no repair before that.

### A second, related finding

Re-running the scoring function across all completed instances of this cycle shows **106 instances where the stored score differs from the recomputed score** (e.g. 100002 stored 89 vs recomputed 74; 102011 stored 53 vs recomputed 70; a large group of CPP/DRI employees off by exactly 2.00). This may be a deliberate finalized snapshot or stale data. This plan **does not change those 106** — it only reports them for your decision.

## Plan

**Step 1 — Confirm the cause (read-only).**
Inspect the change history for the 13 instances to identify the operation that left the score empty. Output: a one-line cause statement.

**Step 2 — Repair the 13 instances.**
Add an admin-only RPC `admin_recompute_annual_review_final_score(p_instance_ids, p_reason)` that:
- is restricted to admin / HR PMS;
- recomputes the criteria score, final score and rating using the existing scoring function — no new scoring maths;
- **only fills an empty score** by default; overwriting a non-empty score needs an explicit flag, so the 106 drifted rows cannot be silently rewritten;
- writes an immutable audit row per instance (old value, new value, reason, actor);
- is idempotent.

Then run it once for the 13 instances with the reason recorded.

**Step 3 — Stop it recurring.**
- Database guard: an instance cannot be marked Completed / finalized with an empty score unless it is Excluded.
- KRA rehydrate and system-score correction paths recompute the instance total in the same transaction as the system-score write.

**Step 4 — Make it visible.**
- Admin banner on the Annual Review admin screen: "N completed reviews have no final score — Recompute", wired to the Step 2 RPC with a confirmation dialog.
- A "Final score missing" indicator in the report's Comprehensive tab so a blank cell is explained rather than silently empty.

**Step 5 — Report the 106 drifted rows.**
A read-only list (stored vs recomputed, difference, template) so you can decide whether they need repair.

## Verification

- Completed-with-no-score count goes 13 → 0.
- Spot check 100264, 100012, 200301 in the Annual Review Report: Final Rating (out of 5), Computed Rating, Slab % and Rating populated and matching the KRA score / 20.
- Re-export the workbook: no blank cells in those columns for completed rows.
- Tests: recompute RPC contract (admin-only, fill-only-when-empty, idempotent, audited) and a guard test for completed-without-score.

## Risk and impact

- Data impact: writes a final score and rating for 13 instances that currently hold none. No existing value is overwritten. Audit rows make it reversible per instance.
- Workflow impact: none for reviewers. The new completion guard blocks finalize attempts with no score, which is the intended protection; Excluded instances are exempt.
- Regression risk: low — repair reuses the existing scoring function rather than a second implementation.
- Scalability: the RPC takes an explicit id list and runs on demand; no bulk scans.

## Documentation

New ADR (Annual Review final-score write-back integrity), a POLICY rule that a completed, non-excluded instance must carry a final score, and a DOCUMENTATION.md version-history entry.