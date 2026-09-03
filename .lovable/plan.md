# Roll back today's accidental edits to "Power generation from 8 MWh"

## What happened (verified in the database)

Three group-definition edits were made from the Performance Console by Ankit Choudhary (101785) on 3 Sep 2026, each fanned out as one run per month (Jul 2026 – Jun 2027):

| Time (UTC) | Field changed | Rows actually written |
|---|---|---|
| 16:06 | `kpi_description` — month-pairs text, added a space before "May - June" | 65 (Jul–Oct 2026) |
| 16:10 | `category_id` — the long "(incentive %)(Aug-Sep,…)" variant moved to another category | 6 (Aug–Oct 2026) |
| 16:16 | `kpi_scoring_logic` — original "20% incentive = 5, 15% = 4 … (pro-rata Kiln shutdown exemption)" replaced with the "Rating 5: ≥ 15% Incentive … (5% Incentive Target)" ladder | 65 (Jul–Oct 2026) |

A fourth action at 16:10 (`rename_kpis_range` on the legacy KPI name) wrote **0 rows** — nothing to undo there.

Every run stored a per-row before-image in `bu_console_edit_items`, and none is marked `undone_at`. So all three are fully reversible.

## Fix

Undo all three edits using the existing, built-in reversal path — no new SQL rewriting of KPI rows.

1. Call `bu_console_undo_edit_run(run_id)` for each affected run, in strict reverse chronological order (16:16 batch → 16:10 batch → 16:06 batch) so the before-images restore cleanly.
2. Skip nothing: the zero-row month runs are included for completeness but write nothing.
3. Verify afterwards that for Jul–Oct 2026 the KPI shows:
   - scoring logic back to "20% incentive = 5, 15% = 4, 10% = 3, 5% = 2, 0% = 1, (exemption should be on pro rata basis of Kiln shutdown days, not for whole month)",
   - description back to "…Mar -Apr,May - June" (no space),
   - the two long-variant rows back in their original category (`bcb2ebfa…`).
4. Confirm the Performance Console and Org KPI Data Entry render the restored text, and that scores, targets, weightages and workflow status are untouched (the undo only writes the same text/category columns).

## Where the undo can be run from

The Console's edit-run history exposes these runs with an Undo action. If the affected runs are not all listed there (the list is capped), the same `bu_console_undo_edit_run` RPC is invoked per run id — the run ids are already identified.

## Technical notes

- Reversal engine: `public.bu_console_undo_edit_run(p_run_id uuid)`, restoring `bu_console_edit_items.old_values` and stamping `undone_at`/`undone_by`. No schema, RLS, grant or signature change.
- Scope: `kpis` rows only, columns `kpi_description`, `kpi_scoring_logic`, `category_id`. No writes to scores, ratings, evidence or review status.
- Locked/approved months: none of the affected rows are outside Jul–Oct 2026; any locked row is skipped by the existing predicate and reported.
- Rollback of the rollback: each undo is itself recorded, so the 16:06/16:10/16:16 values can be re-applied deliberately if any of them turns out to have been intended.
- Docs: ADR entry + DOCUMENTATION version-history line recording the incident and the reversal. POLICY unchanged.

## Steps

1. Resolve and list the exact run ids for the three batches (already queried).
2. Undo the 16:16 scoring-logic batch, then 16:10 category batch, then 16:06 description batch.
3. Re-query the KPI rows for Jul–Oct 2026 and show you the restored values.
4. ADR + DOCUMENTATION + roadmap sync.
