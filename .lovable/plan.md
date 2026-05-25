## Problem

Screenshot shows:
> **Signed off 2 / 4** — *0 KPI(s) advanced · 2 skipped: already final (2)*

This is contradictory and misleading:
- Title implies 2 successful sign-offs.
- Body says 0 advanced (workflow status didn't move) and 2 skipped (final-locked).
- The user can't tell what actually happened to the remaining 2 cells.

## Root cause

The RPC `bulk_write_stage_scores` returns three independent counters:

| Field | Meaning |
|---|---|
| `applied` | rows where the stage column was written (raw write count) |
| `advanced` | rows whose `kpis.status` actually moved forward via reconcile |
| `skipped[]` | rows skipped with a reason (`final_locked`, `self_not_submitted`, `override_requires_input`, etc.) |

The current toast (`BulkReviewDashboard.tsx` lines 480–489) puts `applied` in the title and `advanced` in the body — two numbers that don't add up against `cells.length` and don't explain the 2 unaccounted rows.

In the screenshot case the real story is:
- 2 cells: `final_locked` (skipped, correct per POLICY §88)
- 2 cells: stage column written but reconcile didn't advance status (likely already past the acted stage, or cascade resolved to the same value already on the row)

The toast hides this entirely.

## Fix scope

Frontend-only. No RPC, schema, or policy change. Toast wording in `BulkReviewDashboard.tsx` + a small helper in `src/lib/summariseSkipReasons.ts`.

## Risk & Impact Report

- **Data**: none — pure presentation.
- **Workflow**: none — RPC behaviour unchanged.
- **UI/UX**: toast becomes multi-line, clearer; no layout breakage (existing `ToastDescription` already wraps).
- **Regression**: low — single call-site change.
- **Scalability**: none.
- **Mitigation**: unit test on the toast-summary helper covering all 4 outcome shapes.

## Plan

1. **Extract a pure helper** `summariseStageWriteOutcome({ total, applied, advanced, skipped })` in `src/lib/summariseSkipReasons.ts` returning `{ title, lines: string[] }`:
   - `total = cells.length`
   - `noop = total - applied - skipped.length` (rows the RPC didn't touch and didn't report — should normally be 0; surface if non-zero for debugging)
   - **Title rules**:
     - `advanced === total` → `Signed off — {total} advanced`
     - `advanced > 0 && advanced < total` → `Partially signed off — {advanced}/{total} advanced`
     - `advanced === 0 && applied > 0 && skipped.length === 0` → `No status change — {applied} written, workflow already past this stage`
     - `advanced === 0 && skipped.length === total` → `Nothing signed off — all {total} skipped`
     - `advanced === 0 && applied > 0 && skipped.length > 0` → `No status change — {applied} written, {skipped.length} skipped`
   - **Body lines** (only include when non-zero):
     - `{advanced} advanced to next stage` (omit when 0)
     - `{applied - advanced} written but stage unchanged` with hint *(already past this stage or value unchanged)*
     - `{skipped.length} skipped — {per-reason breakdown}` using existing `summariseSkipReasons`
     - `{noop} unaccounted` only when `noop > 0` (defensive)
2. **Wire helper into `BulkReviewDashboard.tsx`** at the `bulkAction.kind !== 'mgmt'` branch (lines 480–489). Render `title` and join `lines` with ` · ` in description. Keep `mgmt` branch as-is for now (separate concern).
3. **Reason-label polish** in `summariseSkipReasons.ts`:
   - Ensure `final_locked` reads `already finalised (POLICY §88 — immutable)` so users stop reading it as a bug.
   - Confirm `override_requires_input`, `self_not_submitted`, `auditor_takes_precedence`, `row_version_conflict`, `not_found` all have clear labels.
4. **Unit tests** in `src/lib/summariseSkipReasons.test.ts` (new cases):
   - All advanced
   - All skipped (final_locked) — matches reported screenshot
   - Mixed: 2 advanced, 2 skipped
   - applied > 0, advanced = 0, no skips
   - Unaccounted rows present
5. **Docs**: append `DOCUMENTATION.md` v2.66.13.15 entry; `POLICY.md` §111.7.c clarifying that the sign-off toast must distinguish *written*, *advanced*, and *skipped*.

## Expected new toast for the screenshot case

> **No status change — 2 written, 2 skipped**
> 2 written but stage unchanged (already past this stage or value unchanged) · 2 skipped: already finalised (POLICY §88 — immutable) (2)

## Out of scope

- Changing the RPC return shape.
- Touching the `mgmt` approve branch (different counters, separate ticket if needed).
- Any change to override semantics (already landed in v2.66.13.14).

Approve to implement.