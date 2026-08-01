# Wider review-form viewer with one side-by-side reviewer matrix

## What changes for the user

The **Submitted review form** dialog (opened from the Heat Map drill-down "View form" eye icon) gets two improvements:

1. **Wider layout** — the dialog grows from `max-w-4xl` to a near-full-width shell (`max-w-[1400px]`, `w-[96vw]`, still capped at `90vh` with internal scroll), so the comparison table fits without squeezing.
2. **One combined reviewer matrix** — instead of one stacked card per stage, all stages (Self Review, Manager, Dept Head, BU Head, HR, Management — whichever are enabled) appear as **columns of a single table**, with one row per criterion:

```text
Criterion                        | Self      | Dept Head  | BU Head    | Management
                                 | A. Singh  | J. Prakash | U. Mehta   | —
                                 | 13 Jul 26 | 15 Jul 26  | 18 Jul 26  | not submitted
---------------------------------|-----------|------------|------------|------------
Attendance & Punctuality         | 3.00      | 3.00       | 4.00       | —
PPE, Safety Rules & Discipline   | 4.00      | 3.00       | 3.00       | —
Quality & First-Time-Right Work  | 1.00      | 2.00       | 2.00       | —
...                              |           |            |            |
---------------------------------|-----------|------------|------------|------------
Stage score                      | 100.00    | 78.00      | 81.00      | —
Overall remark                   | —         | "Good..."  | "..."      | —
```

Details:
- **Column header per stage**: stage label, reviewer name, submitted date (or "Not submitted"), styled as a sticky header row; the Criterion column is sticky on the left when scrolling horizontally.
- **Per-criterion remarks** are not lost: when a reviewer wrote a comment on a criterion, the cell shows the rating with a small note indicator; hovering/tapping it reveals the full remark in a tooltip/popover, and the remark text is also listed in a "Criterion remarks" disclosure below the table so it stays readable and keyboard-reachable (no hover-only information).
- **Footer rows** inside the same table: `Stage score` (weighted score per stage) and `Overall remark` per stage.
- Empty/missing stage columns render an em-dash cell rather than being hidden, so the reviewer chain stays visible.
- Unchanged: summary strip, Self review answers card, System scores card, "How this score was calculated" breakdown, footer actions.

## UI/UX notes (ui-ux-pro-max)

- Tabular numerals for all ratings; right-aligned numeric cells, left-aligned criterion names.
- Zebra-free bordered grid with `bg-muted/50` header; low-contrast dividers so data leads.
- Horizontal scroll only inside the table container (never the page), with the criterion column pinned.
- Mobile / narrow widths (<768px): the matrix falls back to the current stacked per-stage cards, since a 6-column matrix is unreadable on a phone. Single implementation, two renderers driven by a CSS breakpoint.
- Semantic tokens only — no hardcoded colours; contrast preserved in dark mode.
- Note indicator is an icon + accessible label, never colour alone.

## Technical plan

- `src/lib/annualReview/reviewFormView.ts` — add a pure builder `buildStageMatrix({ template, responses, enabledStages })` that reuses `buildStageBlocks` and pivots it into:
  - `stages: StageBlock[]` (column order = canonical `STAGE_ORDER`)
  - `rows: { id, name, cells: { score, comment }[] }[]` (row order = template criteria order, then extra ids)
  No I/O, no React.
- `src/components/annual-review/StageComparisonTable.tsx` (new) — presentation-only matrix table + criterion-remarks disclosure.
- `src/components/annual-review/ReviewFormViewerDialog.tsx` — widen `DialogContent`, swap the stage loop for `StageComparisonTable` on `md+`, keep the existing stacked blocks for small screens.
- No hook, query, RPC, RLS, schema or scoring change — same data already fetched by `useInstanceReviewForm`.

## Risk & impact

- Data: none (read-only, no new fields).
- Workflow/permissions: none.
- Scalability: same single-instance payload; matrix is bounded by criteria count (typically <15) × stages (≤6).
- Regression risk: limited to this dialog; `buildStageBlocks` is untouched, so existing tests stay green.
- Rollback: revert one new file plus the diff in the dialog and the added builder.

## Verification

- Unit tests in `src/test/annualReview/reviewFormView.test.ts` for `buildStageMatrix`: column order, missing stage columns, criterion row order, unknown criterion ids appended, comments carried per cell.
- Manual: open View form for 201121 (Urmila Devi) — Self / Dept Head / BU Head side by side, totals unchanged vs the current stacked view; check 1263px and 375px widths and dark mode.
- Docs: ADR-218f, POLICY §AR-BELL-CURVE item update, DOCUMENTATION.md version bump.
