## Goal
On the finalized annual review screen (`EmployeeResultsView`), fix three UX issues the employee reported:
1. They can't re-open the self-review form they submitted.
2. The acknowledgment note is shown at the top (inside the score card) — it should live at the bottom.
3. The screen should feel more purposeful: clear sections, expandable self-review, and easier scanning of what matters (rating, KRA, feedback, then your response).

Scope is **frontend-only** — `src/components/annual-review/EmployeeResultsView.tsx` and a small render addition in `src/pages/annual-review/EmployeeAnnualReview.tsx` (already imports `SelfReviewSummaryDialog`). No schema, RPC, RLS, or business-logic changes.

## Risk & Impact
- Data: none.
- Workflow: none — acknowledgment mutation and rebuttal payload unchanged.
- UI/UX: reorders sections and adds an "expand self-review" affordance. No labels or scores change.
- Regression: low — pure presentational changes, existing tests unaffected.
- Mitigation: keep the same props/state; only re-arrange JSX and gate a dialog.

## Plan

### 1. New section order in `EmployeeResultsView`
Top → bottom:
1. **Header card** — title, finalized date, `final_rating` badge, `Acknowledged` badge. (unchanged)
2. **Score summary** — Total / Criteria / System cards, `≈ x/5` under Total. (unchanged)
3. **HR remarks** — read-only block. (unchanged, stays under score summary)
4. **Reviewer criteria scores table** — moved up so employees see reviewer scoring next. (unchanged content)
5. **Recommendations** — moved up next to feedback. (unchanged content)
6. **"Your submitted self-review" collapsible** — new. A `<Collapsible>` (shadcn) that, when opened, renders the existing read-only `SelfReviewSummaryDialog` content inline, or opens the dialog on click if inline embedding is heavier. Simplest path: add a `Button` "View my self-review" that opens the already-imported `SelfReviewSummaryDialog`. This keeps parity with the rest of the app and avoids duplicating the fields renderer.
7. **Your acknowledgment** section (bottom, in its own card):
   - If not yet acknowledged: the current sticky action + `Acknowledge` button + hint text.
   - If acknowledged: show `acknowledged_at` timestamp and, if present, the `employee_rebuttal` note. This is the block currently sitting inside the top score card — it moves out and to the bottom.

### 2. Wire the self-review dialog
- `EmployeeResultsView` accepts a new optional prop `onOpenSelfReview?: () => void`. The parent (`EmployeeAnnualReview.tsx`) passes a handler that toggles the already-present `SelfReviewSummaryDialog` state (or lift a tiny local state into `EmployeeResultsView` and render the dialog itself using props already available: template + responses).
- Preferred: render `SelfReviewSummaryDialog` inside `EmployeeResultsView` gated by local `showSelf` state so the results view is self-contained. Uses the same instance + template + self-response already in scope.

### 3. Visual polish (per skill/ui-ux-pro-max)
- Card typography hierarchy unchanged; add a subtle section divider heading ("Reviewer feedback", "Your self-review", "Your acknowledgment") to signal purpose.
- Keep the sticky bottom bar only when `!acknowledged`; remove it once acknowledged.
- No color/hex changes — reuse existing semantic tokens.
- Ensure the acknowledgment card meets 44px touch targets for the button and stacks cleanly on mobile.

## Out of scope
- Any change to score computation, HR finalization, notifications, or RLS.
- Reworking the self-review renderer itself.
- Multi-language copy changes beyond re-parenting existing strings.

## Verification
- Manual: as an employee on a finalized instance, confirm order (Header → Scores → HR remarks → Criteria table → Recommendations → View self-review → Acknowledgment at bottom); confirm dialog opens and shows submitted answers; confirm rebuttal text now appears in the bottom acknowledgment card, not the header card; confirm sticky bar disappears after acknowledging.
- Run `bunx vitest run` for annual-review component tests (should stay green — no logic touched).
