# UI Assessment — Reviewer KPI Card List (tablet / mobile)

Scope: presentation only for `src/components/review/MobileKpiCard.tsx` and the list container that renders it. No workflow, scoring, RLS, RPC or data changes.

## What the screenshot shows

Each row is a KPI card with: category dot + name, optional Org KPI / "Entered by" badges, KRA title, KPI description, a Target / Weight / Score strip, a state badge (Approved / KRA Set / Manager Check), a green "Fwd" pill and a "View" button.

## Findings (ordered by severity)

1. **Duplicate state signalling.** "Approved" (top-right) and "Fwd" (bottom-right) say the same thing twice, on the same card, in two different visual languages. Adds noise, competes with the primary action.
2. **Type sizes below readable minimums.** Category and metric labels are 9–10px, KPI description 10px, KRA title 12px. Guideline minimum for supporting text is 12px, body 14–16px. On an iPad at arm's length this is the biggest quality gap.
3. **Inverted hierarchy.** The KPI (what is being measured) renders smaller and muted than the KRA line above it, and the metrics are visually louder than the title.
4. **Unbalanced action zone.** A 44px "View" button sits beside 9px labels — the only element sized for touch is the least important one, which makes the card read bottom-heavy.
5. **Metric strip inconsistencies.** Mixed mono/sans, unit spacing artefacts ("100 %", "0 Date", "16 Number"), no tabular figures, so Target/Weight/Score never align vertically across cards.
6. **Hardcoded colour utilities.** `bg-amber-50`, `text-green-700`, `bg-blue-50`, dark-mode twins etc. bypass the design system and are the reason state colours drift between surfaces. Project rule: semantic tokens only.
7. **Sub-44px touch targets.** The KRA/KPI title button, org-scope tooltip trigger, frequency badge and daily expand chevron are all under the minimum tap area.
8. **Wasted tablet width.** Single-column full-bleed cards at 834px produce very long line lengths and heavy scrolling; content density is low relative to the space.
9. **No achievement context.** Target and Score are shown as bare numbers with no indication of scale (Score out of 5) or achieved-vs-target relationship.
10. **Spacing off-rhythm.** Card padding and inter-row gaps mix 6/10/12px values instead of a 4/8 scale, which is what makes the stack feel slightly ragged.
11. **Edge clipping.** Floating side rails overlap the card edges at this width; cards need horizontal inset so nothing sits under fixed chrome.

## Plan

### 1. State model — one badge, one place
- Keep the single canonical status badge in the card header; drop the redundant "Fwd" / "Done" pill from the action row.
- The action row keeps only controls: `View` (always, when read-only) or `Review` + `Send back`.
- N/A, Locked and Draft (Mgmt) remain badges in the header, not in the action row.

### 2. Typography and hierarchy
- Promote the KPI title to the card's primary line (14px, medium, 2-line clamp); KRA name becomes a 12px muted eyebrow above it; description 12px muted, 2-line clamp.
- Metric labels 11px muted uppercase-free; values 14px, `tabular-nums`.
- Category name 12px.

### 3. Metric strip
- Fixed three-column grid (Target / Weight / Score) so values align across every card.
- Unit rendered as a 11px suffix with a single space, suppressed when the unit is a placeholder such as `Date`/`Number` with no meaningful value.
- Score shown as `4 / 5` when a scale is known, otherwise the bare value.

### 4. Tokens and dark mode
- Replace all literal colour utilities in this card with semantic tokens/variants (`success`, `warning`, `info`, `muted`), adding the missing state variants to the badge variant map and `index.css` if absent.
- Verify both themes for text, badge and border contrast.

### 5. Touch and accessibility
- Title button, tooltip triggers, frequency badge wrapper and the expand control get ≥44px effective hit areas (padding or `hitSlop`-style wrappers) without changing visual size.
- `aria-label` on every icon-only control; status badge announced via text, not colour alone.
- Focus-visible rings preserved on the title button and all actions.

### 6. Layout and rhythm
- Card padding to 16px; internal gaps on a 4/8 scale.
- Two-column grid for the card list at ≥768px, single column below; horizontal page inset so cards clear the floating side rails.

### 7. Verification
- Extend `src/tests/reviewerReopenAffordance.test.tsx` and add a card-presentation test: no duplicate state badge, View present for read-only states, metric labels render, no raw colour class on the state badge.
- Playwright screenshots at 390px, 834px and 1280px, light and dark.
- Run typecheck, build and the existing review test files.

### Not in scope
Permissions, workflow stages, scoring, the KPI details modal internals, and the desktop `KpiDetailsTable` (tracked separately if the same treatment is wanted there).

## Technical notes
- Files touched: `src/components/review/MobileKpiCard.tsx`, its list container, badge variants in `src/components/ui/badge.tsx`, tokens in `src/index.css`, plus tests.
- No DB, RPC, RLS or hook signature changes; `MobileKpiCardProps` stays as-is, so every caller (my-kpis, dashboard, team-review, audit, management, skip-level, hr-pms) inherits the fix.
- Rollback: revert the component and token commits; no data migration involved.
