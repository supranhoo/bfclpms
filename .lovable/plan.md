# De-duplicating KPIs at scale (bulk, not one-by-one)

## What the data actually shows

Verified against the live July 2026 data:

- 2,531 KPI rows carry only 966 distinct KPI names — so most "duplication" is name-level, not row-level.
- Almost every KPI name still holds the full description, formula and scoring ladder inside `kpi_name`. That is what creates the three rows in your screenshot: one clean "Power generation from 45 MWh/WHRB", one "… - Description: …", one "… (incentive %)(Aug-Sep,…) Scoring : …". Same metric, three strings.
- The text-splitter engine already exists in the backend (dry-run, apply, rollback, per-KPI part editing) and the duplicate queue already holds 375 pending proposals against 119 canonical definitions and 260 aliases.

Conclusion: the queue is slow because it is being fed dirty text. Similarity over 400-character strings is unreliable, so an admin ends up judging every pair by hand. Clean the titles first and the same scan collapses hundreds of variants into a handful of true groups.

## The method

Three passes, each bulk, each reversible.

```text
Pass 1  Split text      long kpi_name -> title | description | formula | scoring
Pass 2  Group & scan    scan on clean titles -> duplicate groups (not pairs)
Pass 3  Decide in bulk  keep one canonical, alias the rest, in one click per group
```

### Pass 1 — Bulk text split (biggest win, do this first)

A "Clean KPI text" workbench that runs the existing dry-run in grouped mode: identical raw texts are shown once with the row count, the proposed title, and the parts that will be moved out. High-confidence splits are selected by default; the admin scans a page of ~25 groups and applies all of them in one action. Low-confidence rows stay behind for manual editing. Every apply is one run id with a single rollback.

Expected effect: the 966 distinct names shrink toward a few hundred short titles, and the three WHRB rows become one title with different descriptions.

### Pass 2 — Group scan instead of pair scan

The scan runs on the cleaned title (plus the console's existing look-alike normalisation, which already strips month brackets and incentive notes). Output is a group — "Power generation from 45 MWh/WHRB: 3 variants, 14 employees, 3 weightages" — not 3 separate pairwise proposals. Each group shows, side by side, the fields you need in order to decide: frequency, unit, weightage, rating bands, employee count, and whether they disagree ("mixed" flags already exist for this).

### Pass 3 — Bulk decision with a triage filter

The queue gets:

- Select-all / select-page with a single Approve or Reject action, and a keyboard-driven review.
- Auto-suggested canonical: the shortest clean title with the widest employee coverage.
- A confidence filter — "identical after cleaning" groups (exact matches, no mixed fields) can be approved as a batch safely; groups with mixed frequency, unit or rating bands are held back for individual judgement, because those are the ones where you would assign different weightings or distinct logic.
- "Not a duplicate" writes to the existing skip list so the same group never comes back.

## Keeping it unique from here on

- Duplicate check at creation time: when an admin adds a KPI in the Performance Console or Assign KRA, the form warns if a cleaned title already exists in that category and offers to reuse the canonical definition.
- The console already flags look-alike titles inline; that flag becomes the entry point into the workbench.
- A small health tile: distinct titles vs canonical definitions, unsplit rows remaining, groups awaiting decision.

## Risk and impact

- Data: text split rewrites `kpi_name` and fills description/formula/scoring columns on the same row. No score, weightage or history is touched. Merge approval records an alias — it never rewrites past scores, and pre-May-2026 rows stay frozen.
- Workflow: names shown on scorecards get shorter. Weightages, targets and reviewer chains are untouched.
- Regression: split runs and merge decisions each have a rollback path (`kpi_split_rollback`, action reversal log).
- Scale: everything stays server-paged; nothing loads the full KPI table.

## Technical notes

- Reuses `kpi_split_grouped_dry_run`, `kpi_split_apply`, `kpi_split_rollback`, `kpi_split_set_parts`, `scan_kpi_duplicate_groups`, `bu_console_generate_merge_proposals`, `bu_console_decide_merge_proposal`, `kpi_scanner_skips`.
- New server work is limited to a bulk-decision RPC (accepting an array of proposal ids) and a group-level confidence flag on the scan output.
- New UI: a "Clean & de-duplicate KPIs" workbench, reachable from the console header and from KPI Standardization; merge queue gains multi-select, filters and canonical suggestion.
- Unit tests for the cleaning/grouping rules and the bulk-decision model; DOCUMENTATION.md, POLICY.md and a new ADR recorded with the change.

## Suggested order of work

1. Bulk split workbench (dry-run preview, batch apply, rollback).
2. Group-level scan output with mixed-field flags and confidence.
3. Bulk approve/reject plus skip in the merge queue.
4. Create-time duplicate warning and the health tile.
