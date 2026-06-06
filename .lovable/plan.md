# "Hide fully processed" leaks KPIs the viewer never reviews — RCA & CAPA

## Symptom

In Bulk Review (viewer = Auditor, April 2026), the FAR / Capitalize-of-WIP KPI stays visible with `Hide fully processed` ON even though:
- Auditor is **not** in that KPI's workflow (auditor_score will never be filled), and
- HR-PMS has already approved it (`final_score` is set, KPI is terminal).

12 KPIs are hidden, ~30 should be.

## RCA

`src/lib/bulkProcessedFilter.ts` — `isKpiRowFullyProcessed` — defines "processed" purely as *the viewer-stage score column is filled (or `is_na`) for every assignee*. The viewer-stage column is picked from a fixed map:

```ts
const STAGE_SCORE_KEY = {
  manager: 'manager_score',
  skip_level: 'skip_level_score',
  hr_pms: 'hr_pms_score',
  auditor: 'auditor_score',      // ← used for the Auditor view
  management: 'management_score',
};
```

For a KPI whose workflow does **not** route through the auditor stage, `auditor_score` is structurally `null` forever. The helper returns `false` for every such row → the row is never hidden, no matter what stage the KPI is actually finished at.

Two distinct miss-cases produce the same symptom:

1. **Terminal KPI not in viewer's workflow.** FAR KPI is HR-PMS-approved (`final_score` set, status terminal). Auditor isn't in its workflow chain. `auditor_score === null` for every cell → filter keeps the row.
2. **Stage skipped at this period.** Period-specific workflow resolution may drop the auditor stage for a given KPI (see `mem://features/review/period-specific-reviewer-visibility`). Same null-column problem.

The PENDING badges in the screenshot are rendered from the **viewer-stage** queue, not from the KPI's actual lifecycle, which is why the row visually "looks pending" even though it isn't.

## Why tests didn't catch it

`src/lib/bulkProcessedFilter.test.ts` only feeds rows where the viewer stage IS part of the workflow. No case covers `auditor_score === null` + `final_score !== null` (terminal-but-out-of-scope), so the leak is invisible.

## CAPA

### Step 1 — Widen the "processed" definition (single helper change)

Edit `src/lib/bulkProcessedFilter.ts` `isKpiRowFullyProcessed`. A cell is processed when **any** of the following is true:

1. `cell.is_na === true` *(current rule, kept)*
2. `cell[stageKey] !== null` *(current rule, kept)*
3. `cell.final_score !== null` *(new — KPI is terminal; viewer stage was either past or never required)*
4. Cell `status` is a stage at or after the viewer's stage in the canonical workflow order — meaning the viewer's stage was either completed or bypassed. Uses the existing canonical stage order; no new schema.

Conditions 3+4 collapse cleanly to: *"the KPI has progressed past the viewer's stage OR is terminal."*

Signature stays the same; rule 4 is data already on `BulkReviewRow.status`.

### Step 2 — Tests

Extend `src/lib/bulkProcessedFilter.test.ts`:

- Auditor view, `auditor_score=null`, `final_score=4.5` → processed.
- Auditor view, `auditor_score=null`, `status='approved'` (terminal) → processed.
- Auditor view, `auditor_score=null`, `status='hr_pms_approved'` while viewer is `auditor` → processed (HR PMS sits after auditor in the canonical chain? **clarify in implementation by reusing the existing stage-order constant**).
- Auditor view, `auditor_score=null`, `status='manager_approved'`, `final_score=null` → still pending (auditor stage not yet bypassed).
- Existing 5 cases stay green.

### Step 3 — Clarify the toggle label

Update label tooltip on `BulkReviewMatrixGrid.tsx` (line 307) from "Hide fully processed" to keep label but add a hover hint: *"Hides KPIs whose workflow has finished or moved past your stage."* No logic change.

### Step 4 — Docs / Memory

- `DOCUMENTATION.md` → Bulk Review: update "Hide fully processed" semantics.
- `mem://features/review/reviewer-dashboard-view-architecture` → append a one-liner: filter uses `stage-or-after | terminal | N/A`, not just `stage column filled`.

## Risk & Impact

- **Data:** none. Pure UI helper.
- **Workflow:** Auditor & other reviewers will see fewer rows when the toggle is ON. Matches the intent of the toggle. No write paths, no scoring, no RLS touched.
- **Regression:** low. The widened definition is strictly *more permissive* (more rows qualify as processed) and never hides a row that has at least one truly pending assignee at the viewer's stage.
- **Scalability:** unchanged — same O(rows × employees) loop.
- **Rollback:** revert one helper + one test file.

## Out of scope

- Why the snapshot returns KPIs that aren't in the auditor's workflow at all (server-side scope question; tracked separately under `period-specific-reviewer-visibility`).
- Hiding the misleading PENDING badge on stage-skipped cells (separate visual fix).
