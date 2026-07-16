# Auto-expanding Qualitative Response textareas

## Problem
On the Self Review / Team Review detail pages, the "Qualitative Responses" card renders each answer in a fixed 3-row `<Textarea>` with an inner scrollbar. Long answers (achievements, KRAs, improvements) get clipped into a tiny scroll window, making them hard to read for downstream reviewers.

## Fix (UI only, single file)
Update `src/components/annual-review/SelfReviewFieldsCard.tsx` so each textarea grows to fit its content instead of scrolling internally.

**Approach:** auto-size via a small effect that syncs `height` to `scrollHeight` whenever the value changes (and once on mount / when `readOnly` toggles). No new dependency.

- Replace the static `rows={3}` textarea with an auto-sizing wrapper (either an internal `AutoGrowTextarea` sub-component inside this file, or a `useLayoutEffect` + ref per field).
- Behavior:
  - Min height ≈ 3 rows (keeps empty fields from collapsing to one line).
  - No max height — expands fully so the whole answer is visible without inner scroll.
  - Recomputes on: value change, mount, `readOnly` change, and window resize (to handle wrap changes on viewport resize).
  - Set `overflow-y: hidden` while auto-sized so the scrollbar disappears; keep `resize-none` so users can't drag-shrink it back.
- Preserve everything else: label, required asterisk, `SpeakButton`, i18n via `tTemplate`, disabled/readOnly semantics, `onChange(id, value)` contract.

## Scope guardrails
- Only touches `SelfReviewFieldsCard.tsx`. Both surfaces that render it (`/annual-review` employee self page and `/annual-review/team/:id` reviewer detail page — editable and read-only modes) inherit the fix automatically since it's the SSOT for these fields.
- No changes to data, API, template config, or other textareas elsewhere in the app.
- Existing test `src/components/annual-review/SelfReviewFieldsCard.test.tsx` continues to pass (label rendering, onChange contract, readOnly disable behavior are unchanged).

## Risk
- Very low. Pure presentational change inside one component. Worst case: a long answer makes the card taller, which is the desired outcome. Card sits in a normal scroll container so page scroll handles overall height.

## Test additions
- Add one test: mounting with a long `values[id]` produces a textarea whose inline `style.height` is set (i.e., auto-size ran), and `overflow-y` is hidden.

Shall I implement?
