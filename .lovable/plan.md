## Why this is needed

The trigger fix from ADR-086 only acts on **future** edits. The siblings shown in your screenshot (Dec 2025, Jan 2026, Feb, Mar) were already written by the old buggy trigger and still hold stale values in `review_submissions`. Nothing re-runs the trigger over historical data unless we explicitly do so.

## Confirmed state (live DB)

KPI: **Stock audit / Ensure minimum variance** — Half-Yearly, cycle anchor `May-Oct`. The Nov–Apr cycle's terminal is **April 2026**.

| Month | self | manager | auditor | final | rating | is_na | achieved |
|---|---|---|---|---|---|---|---|
| Dec 2025 | 0.00 | 0.00 | — | 0.00 | red | false | 0.00 |
| Jan 2026 | 5.00 | 5.00 | — | 5.00 | blue | false | 0.11 |
| Feb 2026 | 5.00 | — | — | — | — | **true** | 0.11 |
| Mar 2026 | 5.00 | 5.00 | — | — | — | **true** | 0.11 |
| **Apr 2026 (terminal)** | 4.00 | 5.00 | 5.00 | **5.00** | blue | false | **0.71** |

All five rows have `kpis.status = 'approved'`. April's authoritative scores never propagated.

## What the backfill will do

A single migration that targets ONLY this employee + KRA + KPI + Nov–Apr cycle (no broader sweep):

1. Set transaction-local `app.percolation_bypass = 'true'` and `app.repercolation_active = 'true'` so existing locks/recursion guards stay clean.
2. Read the April 2026 terminal `review_submissions` snapshot once into a CTE.
3. `INSERT … ON CONFLICT (kpi_id) DO UPDATE` the snapshot onto the 4 sibling `review_submissions` rows (Dec 2025, Jan 2026, Feb 2026, Mar 2026). Mirrors every column the live trigger mirrors (all stage scores, ratings, achieved values, remarks, evidence URLs, `is_na`, `submitted_at`).
4. Ensure each sibling `kpis.status = 'approved'` (already true; defensive).
5. Insert one `SCORE_REPERCOLATED` row per sibling in `kpi_audit_logs` with:
   - `performed_by = NULL` (automated)
   - `metadata.policy = 'POLICY_54_v5'`
   - `metadata.tool = 'BACKFILL_MULTIMONTH_PERCOLATION_v2'`
   - `metadata.source_kpi_id` = April's id, plus `sibling_period`, `sibling_year`

## Risk & impact

- **Data:** Overwrites 4 sibling submissions with April's snapshot. Per your approval, this is the intended behavior even though those rows are 'approved' — POLICY §54 makes the terminal canonical.
- **Workflow:** No status transitions (all already approved).
- **UI/UX:** After backfill, all 4 sibling rows in the screenshot will show `Achieved 0.71`, `Self 4.0`, `Manager 5.0`, `Auditor 5.0`, `Final 5.0 (blue)`, `is_na = false`. February and March will stop showing N/A.
- **Regression risk:** Surgical; touches exactly 4 review_submissions rows + 4 audit rows. Zero schema change. May 2026 (`manager_check`) and June 2026 (`kra_set`) untouched.
- **Rollback:** Pre-backfill values for the 4 siblings are captured above; reversal is a manual `UPDATE` if ever needed.

## Files

- `supabase/migrations/<new>_backfill_ashish_stock_audit_h2_2026.sql` — the one-shot, idempotent (re-running is a no-op because April's snapshot won't differ from siblings after the first run).

No app code changes; no test changes (ADR-086 regression guard already covers the trigger).

## Verification after apply

Re-query `review_submissions` for the 4 sibling kpi_ids and assert each row matches April's snapshot, plus confirm 4 fresh `SCORE_REPERCOLATED` audit rows exist with `tool = BACKFILL_MULTIMONTH_PERCOLATION_v2`.

Reload the Stock-audit Journey UI for Ashish and confirm Dec → Mar match April.
