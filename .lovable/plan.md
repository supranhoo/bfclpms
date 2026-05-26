
## Goal

In the Bulk Review matrix toolbar (the red-highlighted strip between "Collapse all" and the `KPIs / employees / cells` counters), add a toggle that **hides KPI rows where the current viewer stage is already filled in for every filtered employee**. If even one filtered employee on that KPI is still pending at the viewer's stage, the row stays visible.

This is a pure presentation filter — it does not change selection logic, RPC payloads, scoring, or RLS.

## Risk & Impact Report

- **Data Impact:** None. No schema, RLS, RPC, or audit log changes.
- **Workflow Impact:** None. Hidden rows are still in `rows`; only the rendered `kpiRows` list shrinks. Selection state is preserved (rows still in scope via submission IDs; hiding doesn't auto-deselect).
- **UI/UX Impact:** One new `Switch + Label` in the existing toolbar, mirroring "Show KRA · Wt%". Counter strip on the right gets a small "(N hidden)" suffix when the filter is active so users know rows are being suppressed. Empty-state message shown if all rows get hidden.
- **Regression Risk:** Low. Scope limited to `BulkReviewMatrixGrid.tsx`. Toggle defaults to OFF → existing behavior is byte-identical when off.
- **Scalability Impact:** O(rows) per re-render, same as the existing memo; no extra fetches.
- **Mitigation:** Pure-function helper in `src/lib/bulkRowSelection.ts` (or new `src/lib/bulkProcessedFilter.ts`) with unit tests covering the "all done", "one pending", "no submission", and "N/A" cases.

## Plan

### 1. Pure helper (logic isolated from UI)

New file `src/lib/bulkProcessedFilter.ts`:

```ts
// Returns true if every employee column for this KPI key is already
// processed at the viewer stage. "Processed" means:
//   - the cell exists AND
//   - the stage score column is non-null OR the cell is_na is true.
// Rows with no cell for an employee are treated as PENDING (visible).
export function isKpiRowFullyProcessed(
  kpiKey: string,
  employeeIds: string[],
  cellMap: Map<string, BulkReviewRow>,
  stageKey: keyof BulkReviewRow,
): boolean
```

Tests in `src/lib/bulkProcessedFilter.test.ts`:
- all employees have stage score → hidden
- one employee pending → visible
- one employee missing cell → visible
- mixed N/A + score → hidden
- empty employee list → visible (defensive)

### 2. Wire toggle into `BulkReviewMatrixGrid.tsx`

- Add `const [hideProcessed, setHideProcessed] = useState(false);`
- In the existing `useMemo`, after building `kpiRowsArr`, apply the filter when `hideProcessed` is true, using `stageKey` and `employeesArr` ids.
- Add `hiddenCount` to the memo return so the toolbar can show "(N hidden)".
- Add toggle UI inside the existing toolbar `div` (left cluster), after the Collapse/Expand buttons, separated by the same `border-l` divider:
  ```tsx
  <Switch id="hide-processed" checked={hideProcessed} onCheckedChange={setHideProcessed} />
  <Label htmlFor="hide-processed" className="text-xs font-medium cursor-pointer">
    Hide fully processed
  </Label>
  ```
  Includes a `Tooltip`: *"Hide KPI rows where every filtered employee already has a {stageLabel} score. Rows reappear if any employee is still pending."*
- Right counter cluster: when `hideProcessed && hiddenCount > 0`, append `<span className="text-amber-600">({hiddenCount} hidden)</span>`.
- Empty state: if `kpiRows.length === 0 && hideProcessed`, render a small inline notice above the table with a "Show all" link that flips the toggle off.

### 3. Stage label

Reuse the existing `STAGE_SCORE_KEY` map; add a sibling `STAGE_LABEL` constant for the tooltip text (Manager / Skip Level / HR PMS / Auditor / Management).

### 4. Tests

- `bulkProcessedFilter.test.ts` (new) — 5 cases above.
- No changes needed to existing bulk-review contract tests (filter is UI-only).

### 5. Docs & Policy

- `DOCUMENTATION.md` — add v2.66.13.19 entry under Bulk Review: "Hide fully-processed KPIs toggle".
- `POLICY.md` §111 (Bulk Review UX) — add bullet: *"Reviewers may hide KPI rows where every filtered employee already has the viewer-stage score recorded. The toggle is presentation-only; selection, audit, and override paths are unaffected. Rows with any pending employee remain visible to preserve completion visibility."*
- `mem://features/review/bulk-review-dashboard` — append toggle behavior note.

## What changes visually

- **Location:** Bulk Review → `/review/bulk` matrix toolbar, immediately right of the "Collapse all" button, separated by the same vertical divider style used today.
- **Default:** Off — no visible change until user opts in.
- **When on:** KPI rows whose viewer-stage column is filled for every employee column disappear; right-side counter shows `(N hidden)` in amber; if all rows get hidden, an inline "All KPIs processed at this stage — Show all" notice replaces the matrix.
- **Responsiveness:** Toggle wraps to the next line on narrow viewports thanks to existing `flex-wrap` on the toolbar.

## Out of scope

- Persisting the toggle in URL/localStorage (can be added later via `bulkUrlState` if requested).
- Hiding employee columns whose every KPI is done (different UX, separate request).
- Changing the definition of "processed" beyond the viewer stage (e.g. terminal-stage approval) — current spec matches what the reviewer cares about at their own stage.
