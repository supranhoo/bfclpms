# Fix overlapping KPI text on Org KPI Data Entry

## What is wrong

On the Org KPI Data Entry card for tiered KPIs (e.g. "Achieve 3X100 TPD Power
Generation target"), the selected rating option text spills out of its control
and paints over the status chips, the Remark box and the card body.

Cause (verified in code): the shared rating dropdown
`src/components/review/QualitativeSelect.tsx` hardcodes a fixed
`w-[140px]` trigger, and its selected-value content is a flex row with an
unconstrained `<span>`. The Org KPI card passes `h-9`, so the trigger is fixed
at 140x36px while the label ("90% – 94.99% Achievement (of the 5% Incentive
Target)") is far longer — the text wraps and overflows in every direction.

This is a presentation bug only. No data, scoring, RPC, RLS or workflow
behaviour is involved.

## Fix

1. `QualitativeSelect.tsx`
   - Trigger: replace the hardcoded `w-[140px]` with `w-full min-w-0` merged via
     `cn()` so callers keep the ability to set their own width, and keep the
     text on one line with `truncate` plus a `title` attribute carrying the full
     label. The rating badge gets `shrink-0` so it is never squeezed out.
   - Trigger content: wrap in `min-w-0` flex so truncation actually applies.
   - Dropdown items: allow the long labels to wrap (`whitespace-normal`,
     `leading-snug`) instead of being clipped, with the badge `shrink-0`, and cap
     the popover width so it does not exceed the card.
   - Replace the hardcoded `text-white` on the rating badge with the semantic
     `text-primary-foreground` token (design-system compliance); the rating
     colour swatches stay as-is.
2. Keep every other call site working: the width becomes container-driven, so
   narrow table cells stay narrow and the wide Org KPI card now uses full width.

## Where it shows up

- Admin → Org KPI Data Entry: the tiered rating control becomes a single-line,
  full-width control; no text paints over the badges, Remark field or Save row.
- Review scorecards / data-entry grids that reuse `QualitativeSelect`: the
  control fills its cell instead of a fixed 140px, long options truncate with a
  hover tooltip and wrap fully inside the dropdown.
- Mobile: no horizontal overflow; the option list wraps rather than clipping.

## Technical notes

- Files: `src/components/review/QualitativeSelect.tsx` (only), plus a small
  render test at `src/test/qualitativeSelectLongLabel.test.tsx` asserting the
  trigger truncates and carries the full label in `title`.
- No schema, RPC, RLS, grant or query-key change. Zero regression risk to
  scoring: `onChange(label, rating)` contract is untouched.
- Rollback: revert the single component file.
- Docs: ADR entry for the shared-control width fix plus DOCUMENTATION.md
  version-history line; POLICY.md unchanged (no policy shift).

## Verification

- `bunx vitest run` for the Org KPI + new suite, `tsgo` typecheck, build.
- Playwright screenshot of the Org KPI Data Entry card to confirm no overlap at
  1280px and at 375px.
