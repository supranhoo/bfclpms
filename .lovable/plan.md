## Root cause (verified)

The toast `column "weighted_final_score" of relation "annual_review_instances" does not exist` fires when the "Edit workflow & reviewers" dialog saves in **supersede mode** on a completed review (typing `REPLAN`).

Confirmed via live DB:
- `annual_review_instances` score/rating columns are: `total_score`, `final_rating`, `criteria_weighted_score`, `system_scores`, `system_scores_raw`, `carry_score_snapshots`, `finalized_at`, `finalized_by`. **`weighted_final_score` does not exist.**
- The live definition of `public.set_annual_review_enabled_stages(...)` (installed by migration `20260725105144`, ADR-160c) still contains `weighted_final_score = NULL` in its supersede-reset `UPDATE`. The earlier ADR-168 fix (`20260725105555`) only corrected the enum mapping in that function; it did not remove the phantom column.
- The `pending_dept_head` enum bug from the same migration is already fixed live (maps to `pending_dept`). No other issue in this path.

## Fix

New migration that `CREATE OR REPLACE`s `public.set_annual_review_enabled_stages` with the exact current body, minus the `weighted_final_score = NULL,` line in the supersede reset block. All other logic (canonical role→status mapping, override cleanup, audit insert, notifications) is preserved byte-for-byte.

Fields cleared on supersede reset become: `total_score`, `final_rating`, `criteria_weighted_score`, `completed_at` — which matches the real schema and matches what the frontend impact-preview text promises ("the final rating and totals will be cleared").

No frontend, no other RPC, no policy change.

## Regression guard

Add `src/test/annualReview/supersedeResetColumns.test.ts` — a static-source test that reads the latest migration touching `set_annual_review_enabled_stages` and asserts:
- it does NOT contain `weighted_final_score`
- it DOES clear `total_score`, `final_rating`, `criteria_weighted_score`, `completed_at`
- the `dept_head` branch maps to `pending_dept` (locks ADR-168 in the same code path)

## Docs

- `DOCUMENTATION.md` — add v2.66.169.1 note under ADR-160c / ADR-167 lineage.
- `POLICY.md` — extend §AR-CANONICAL-ROLE-STATUS-MAPPING with the invariant "supersede reset writes only real columns; any change to the reset column set requires a schema check".
- New `docs/adr/ADR-169a.md` — small addendum documenting the phantom-column fix.

## Risk & Impact

- **Data**: none. The removed assignment referenced a non-existent column, so every supersede save was rolling back. Existing rows are unaffected.
- **Workflow**: unblocks the "Edit workflow & reviewers → Save" supersede path for completed instances (Kiran Devi and the rest of the ADR-160c cohort).
- **Regression**: static test locks the column set; canonical role/status mapping test from ADR-168 remains authoritative.
- **Rollback**: re-run the previous `CREATE OR REPLACE` from `20260725105144` if needed.
