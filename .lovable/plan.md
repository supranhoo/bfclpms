

## Plan — Re-Score the 17 Mis-Backfilled Submissions Using the Real Scoring Engine

### Root Cause (Confirmed)

The `PROPAGATION_BACKFILL` script (Phase A1, run 21 Apr 2026 by `bucket_bc_repair`) copied each parent OKV's `achieved_value` into the child `review_submission` row but then **hardcoded `self_score=0, self_rating='red'`** instead of running the real scoring engine on the value. So the achieved value transferred correctly — only the score was wrong.

Anant Shankar Shet's case is the textbook example:

| Field | Value |
|---|---|
| KPI | Pending metal for jigging Inventory below 5T |
| Criteria | Lower is Better |
| Thresholds | R5=0, R4=1, R3=2, R2=3, R1=4 (Days) |
| Achieved (from Biswajit's OKV) | **0 Days** |
| Correct rating | **R5 (5.00, blue)** |
| What backfill wrote | **0.00, red** ← bug |

The same bug hits 7 of the 17 zero-backfilled rows where `achieved=0` is genuinely a perfect score (Lower-is-Better KPIs like "non-compliance days", "missed report days"). For the remaining 10 rows, achieved=0 against a Higher-is-Better cascade or budget cascade really should rate 0 — but even those should be re-scored through the engine, not pinned to 0 by fiat.

### The 7 Rows That Were Definitely Mis-Scored (achieved=0, Lower-is-Better, R5=0)

| Employee | KPI | Should be |
|---|---|---|
| Anant Shankar Shet | Pending metal for jigging | **R5 (5.00)** |
| Bhoopendra Kumar Sinha | Raw Material Plan & Other MIS | **R5 (5.00)** |
| Jyoti Prakash Dwivedi | Raw Material Plan & Other MIS | **R5 (5.00)** |
| Ramchandra Reddy Gannu | MIS (already corrected to 5.00 by another path) | R5 ✓ |
| Subhransu Sekhar Nayak | MIS | **R5 (5.00)** |

(Ramchandra's row already shows `current_score=5.00` — someone or something corrected it post-backfill, so it's fine. The other 4 are still wrong in the live DB.)

The other 13 rows (budget KPIs, production-target KPIs) have achieved=0 against a "Higher is Better" or budget scale where 0 legitimately = R0 — but the broken `r2='1%'` master-data on the budget KPIs (covered in your earlier approved plan) means those should also be revisited once the threshold fix lands.

### Fix — Three-Part Repair

**Part A — Re-score the affected backfilled rows through the real engine** (one-time data migration)

For every `kpi_audit_logs` row with `action='PROPAGATION_BACKFILL'` AND `pass='phase_a1'`:
1. Fetch the linked `review_submissions` row.
2. **Skip if `final_score IS NOT NULL`** (Submission Snapshot Immutability §88).
3. **Skip if `submitted_at` was updated by an employee after the backfill** (don't overwrite their work).
4. **Skip if a manager/auditor already entered a score** (`manager_score IS NOT NULL` or `auditor_score IS NOT NULL`).
5. Run `calculatePercentageRating` / `calculateAbsoluteRating` against the current `achieved_value`, the master KPI's criteria/thresholds.
6. Update `self_score` and `self_rating` accordingly.
7. Log each correction as a new `kpi_audit_logs` row with `action='PROPAGATION_BACKFILL_RESCORE'`, `performed_by=NULL`, full before/after for traceability.

This is a server-side script invoked from a new Admin > System Settings > Data Repair card called **"Re-score Backfilled Submissions"** with the same Scan → Preview → Apply lifecycle as the other repair tools (per `mem://features/admin/data-repair-engine`).

**Part B — Patch the Phase A1 script to use the engine going forward**

The `bucket_bc_repair` edge function (or migration script) that originally ran Phase A1 hardcoded `self_score=0`. Update it to call the same `calculatePercentageRating` / `calculateAbsoluteRating` helpers used everywhere else, so any future re-run never reproduces this bug. Add a unit test that proves a Lower-is-Better KPI with achieved=0 and R5=0 returns score=5.

**Part C — Add a guard in the Universal Scoring Logic**

In `src/lib/ratingCalculation.ts`, add a sanity check that any caller passing pre-computed scores must also pass the achieved value, and assert (in dev) that the score matches what the engine would produce. This is a dev-only assertion to catch any future code path that bypasses the engine.

### Files Changed

| File | Change |
|---|---|
| `src/components/admin/RescoreBackfilledSubmissionsDialog.tsx` (new) | Scan/Preview/Apply UI, modeled on `FixCorruptedScoresDialog.tsx` |
| `supabase/functions/rescore-backfilled-submissions/index.ts` (new) | Server-side re-score using shared `ratingCalculation` helpers; respects all 4 skip-rules |
| `src/lib/ratingCalculation.ts` | Dev-only assertion when score is supplied separately from achieved |
| `src/lib/__tests__/ratingCalculation.test.ts` | New cases: Lower-is-Better with R5=0 and achieved=0 → R5; achieved>R0 → R0 |
| `supabase/functions/bucket-bc-repair/index.ts` (or equivalent) | Replace hardcoded `self_score=0` with engine call |
| `src/pages/admin/SystemSettings.tsx` | New card in Data Repair tab linking to the new dialog |
| `DOCUMENTATION.md` | v2.66.7.16 entry — backfill re-score tool + engine-call requirement |
| `POLICY.md` | New §: "Backfill operations MUST use the canonical scoring engine; pre-set scores are forbidden" |
| `mem://features/admin/data-repair-engine` | Append: Re-score Backfilled Submissions card; engine-only backfill rule |

### Risk & Impact Report

- **Data Impact**: Only touches `self_score`/`self_rating` on rows the backfill itself created. Skip-rules guarantee no employee work, no manager input, and no finalized score is overwritten. Approved/finalized scores untouched per §88.
- **Workflow Impact**: 4–7 employees flip from a misleading red R0 to their correct rating (mostly R5). Reviewers see correct numbers in their queues; manager review proceeds as if the bug never happened.
- **UI/UX**: No visible UI changes for end users — only the numbers change. New admin card uses the existing Data Repair pattern.
- **Regression Risk**: Very low. New script is read-then-write with explicit guards; no schema changes; engine helpers are already battle-tested.
- **Mitigation**: Mandatory dry-run preview before apply; every change produces an audit row; new test case pins the exact Anant scenario so the regression cannot return.

### Out of Scope (for this fix)

- The `r2='1%'` budget-KPI master typo — covered by the earlier approved plan; that fix's rescore pass will also catch the budget rows once the thresholds are correct.
- The `kra_set` → `self_review` status transition itself — that part of the backfill was correct, only the score was wrong.
- Touching `final_score` on already-approved rows.

