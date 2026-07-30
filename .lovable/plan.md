## Assumptions

- The ask is about the **PIP Suggestions** tab (screenshot): today the window is always the trailing N complete months ending with *last* month. Because monthly KRA review can lag up to ~2 months, the most recent months are blank (`—`) and rows get judged on an incomplete picture.
- Fix = let the user choose **which month the window ends on**, keeping the existing 3/6-month length selector. No change to the trigger rules themselves.

## Clarification (proceeding with the default unless you say otherwise)

Default anchor stays "previous complete month" so nothing changes for existing users; they can shift it back to e.g. May 2026 when June data isn't reviewed yet.

## Risk & Impact Report

- **Data impact:** None. Read-only view; no schema, RLS or data change.
- **Workflow impact:** None — suggestions remain advisory; plan creation unchanged.
- **UI/UX:** One extra `Select` in the existing filter row ("Up to month"), left of Window. Same row wraps on small screens as today.
- **Regression risk:** Low, isolated to `usePIPCandidates` window derivation and the panel's filter bar. The monthly trend RPC already accepts arbitrary from/to periods (used by the Trend report), so no server work.
- **Scalability:** Identical query shape and volume; only the period bounds change. Query key gains the anchor so caching stays correct.
- **Mitigation:** New unit tests on the window helper; existing 38 PIP tests must stay green.

## Steps

1. **`src/hooks/usePIPCandidates.ts`**
   - Add optional `anchor?: { month: string; year: number }` to `UsePIPCandidatesOptions`.
   - Generalise `trailingWindow(windowMonths, today, anchor?)`: when an anchor is given the window *ends* at that month; otherwise keep today-minus-one behaviour. Pure function, exported.
   - Include the anchor in the `useMonthlyTrend` inputs (it already keys on from/to) so switching months refetches.
   - *Verification:* new tests for anchored windows, year rollover (e.g. Feb 2026 anchor with 6 months → Sep 2025…Feb 2026), and unchanged default.

2. **`src/components/pip/PIPSuggestionsPanel.tsx`**
   - New state `anchor` defaulting to previous complete month; `Select` labelled **"Up to month"** listing the last 18 complete months (`July 2026`, `June 2026`, …), built from the same MONTHS constant — no hardcoded list.
   - Resets `page` to 1 on change, like other filters; passes anchor to the hook.
   - Header caption already renders the evaluated month columns, so the grid's Jan…Jun headers follow the anchor automatically.
   - *Verification:* screenshot the tab with anchor set to May 2026 and confirm columns shift and the Annual column is unaffected.

3. **Docs (mandatory sync)**
   - `docs/adr/ADR-207.md`: append an "Amendment — anchored evaluation window" note.
   - `POLICY.md` §PIP-TRIGGER-SUGGESTIONS: state that the §15.2 window is *N complete months ending at an admin-selected anchor month*, default previous month, to accommodate review lag.

## UI changes

Filter row of **Admin → Performance Improvement Plans → Suggestions**, becomes:
```text
[ Up to month: June 2026 v ] [ Window: Last 6 months v ] [ Trigger v ] [ Search ]   (Threshold: 2.00) (Refresh)
```
Month columns in the grid and the reason text re-derive from the chosen window.

## Rollback

Purely additive frontend change; reverting the two files restores current behaviour.
