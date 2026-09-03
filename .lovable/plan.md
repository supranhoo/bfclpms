# Declutter the reviewer KPI card list (tablet / mobile)

## What the screenshot shows

The ADR-356 pass improved readability per card but the **two-column grid at 834px**
makes the overall screen feel more cluttered than before:

1. Cards are only ~380px wide, so each card's header wraps into a dense cluster of
   dot + category + icons + frequency pill + status badge.
2. The KRA eyebrow line and the KPI title often repeat the same words
   ("Implement inventory management system" appears twice), doubling the text.
3. Org-KPI cards add a second full badge row ("Org KPI" + "Entered by: ..."),
   pushing cards taller and more uneven in the grid.
4. Two columns of tall, unequal cards create a ragged masonry effect — the eye
   can't scan a clean row rhythm.
5. The scorecard toolbar above (Add KRA / Copy KRAs / Zero-Score / Rollover KRAs)
   overflows the right edge at 834px, clipping over the cards.

## Changes (presentation only — no props, permissions, RPC, workflow, or scoring changes)

### 1. Grid: two columns only when there is real room
- `UnifiedScorecard.tsx`: change the card list from `md:grid-cols-2` to
  `lg:grid-cols-2`. Below 1024px (iPad portrait = 834px) cards return to a single
  comfortable column; two columns only appear on landscape tablets / desktops.

### 2. De-duplicate the text block
- When the KRA name and KPI title start with the same text (case-insensitive,
  first ~40 chars), render only the KPI title and drop the KRA eyebrow on the card
  (the category chip above already gives context). Pure display predicate in
  `MobileKpiCard.tsx`; data untouched.

### 3. Collapse the header cluster
- Category name truncated to one line with the colour dot (as today).
- The org-scope tooltip icon is removed from the header — that information already
  exists in the Org KPI badge, so the icon is redundant.
- Frequency badge stays; observation count and Sent-Back badge stay (real signals).

### 4. Merge the Org-KPI badge row into one compact line
- "Org KPI" badge and "Data Owner / Entered by" chip combine into a single muted
  text line: `Org KPI · Entered by Vivek Kumar Dansena` (icon + 12px muted text),
  instead of two pill badges on their own row.

### 5. Slightly tighter card rhythm
- Card gap `gap-3` kept; internal sections tightened so single-column cards read
  as: meta line → title → metrics+actions. No other spacing change.

### 6. Toolbar overflow fix (the clipping at the top of the screenshot)
- The scorecard action toolbar (Add KRA / Copy KRAs / Zero-Score / Rollover KRAs)
  gets `flex-wrap` (or collapses into an overflow menu below `lg`) so it never
  extends past the viewport edge. This is the same class of fix as the card work
  and is small, so it is included here.

## What stays the same

- One status badge in the header, no Fwd/Done pills (ADR-356).
- Labelled View/Review/Send-back controls with ≥44px hit areas (ADR-355).
- Metric grid with `tabular-nums` and `n / 5` score context.
- Semantic tokens only; no new colours.

## What changes visually

- iPad portrait (834px): one card per row, shorter cards, no repeated text,
  header reduced to category + status, org info as a single muted line, toolbar
  fully visible.
- ≥1024px: two-column grid retained.
- Mobile (≤767px): unchanged single column, with the same text de-duplication
  and org-line merge applied.

## Tests

- Extend `src/tests/mobileKpiCardPresentation.test.ts`:
  - grid class is `lg:grid-cols-2` (not `md:`),
  - eyebrow suppressed when KRA name ≈ KPI title,
  - no duplicate org-scope tooltip trigger when Org KPI badge line renders,
  - org info renders as a single line, not two badges.
- Re-run `reviewerReopenAffordance.test.tsx` (ADR-355 guard) — must stay green.
- Visual check at 390 / 834 / 1280 after implementation.

## Risk & impact

- Data: none. Workflow/permissions: none. Rollback: revert the touched
  presentation files.
- Regression risk: low — confined to card layout and the scorecard toolbar.

## Docs

- Append to `docs/adr/ADR-356.md` (follow-up note) or new ADR-357; DOCUMENTATION.md
  version entry; POLICY §REVIEW-CARD-PRESENTATION updated with the grid-breakpoint
  and de-duplication rules; roadmap.md updated.
