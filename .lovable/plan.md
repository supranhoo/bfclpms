## Goal
Match the uploaded mock for the **Self-Assessment Criteria (Section B)** card when language = Hindi:

- Criterion **name + description** render in Hindi (already wired via `tTemplate`, but the description currently uses the same key and works — verified).
- The three header badges (`Weight × Score = Total`) render their **labels in Hindi** (`भार × अंक = कुल`). Numbers stay numeric.
- The 0–5 round button row is replaced by a **grid of option cards** (3 columns desktop / 2 tablet / 1 mobile) when the criterion has authored `options` — each card shows:
  - radio dot
  - **bilingual label** `"<English> / <Hindi>"` (joined only when current ≠ default language and a translation exists; otherwise just the active-language label)
  - `Score: N`
  - selected card highlighted (amber ring + tinted bg, matching mock)
- A small heading `आपका स्कोर` ("Your Score") above the grid.
- Fallback unchanged: criteria **without** `options[]` keep today's 0–5 button row (no regression for legacy templates).

## What changes visually
Location: Employee / Reviewer Annual Review page → "Self-Assessment Criteria" card → each `CriterionRow`.

Before (today):
```text
[ Name / Desc ]                 [ Weight | × | Score | = | Total ]
( 0 ) ( 1 ) ( 2 ) ( 3 ) ( 4 ) ( 5 )      ← round buttons
```

After (when `criterion.options` present):
```text
[ Name / Desc ]                 [ भार | × | अंक | = | कुल ]
आपका स्कोर
┌──────────────────┬──────────────────┬──────────────────┐
│ ◯  Always on…    │ ◯  Rarely late…  │ ●  Usually on…   │  ← selected
│    हमेशा समय पर  │    शायद ही…       │    आमतौर पर…     │
│    Score: 5      │    Score: 4      │    Score: 3      │
├──────────────────┼──────────────────┼──────────────────┤
│ ◯ Frequently…    │ ◯ Very poor…     │ ◯ Unacceptable…  │
│   Score: 2       │   Score: 1       │   Score: 0       │
└──────────────────┴──────────────────┴──────────────────┘
```

Responsiveness: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`, min tap target 44×44 (UX rule §2). Selected = `ring-2 ring-amber-500 bg-amber-500/5`. Read-only disables click + dims to 60%.

## Technical details

1. **`src/lib/annualReview/i18n.ts`** — add Hindi + Spanish keys:
   - `criteria.your_score` → `आपका स्कोर` / `Tu puntuación`
   (English fallback `"Your Score"` lives at call site.)
   `col.weight/score/total` already exist — no change.

2. **`src/components/annual-review/AnnualReviewI18nContext.tsx`** — add a helper exported from the context:
   ```ts
   tTemplateBilingual(kind, id, field, fallback) → string
   ```
   Returns `fallback` when `current === default`, otherwise `\`${fallback} / ${translated}\`` (skips the join if no translation exists). Used only for option labels per mock.

3. **`src/components/annual-review/CriteriaScoringMatrix.tsx`** — additive:
   - If `criterion.options?.length > 0`: render the new option-card grid (new internal `OptionCardGrid` component in the same file). Selection driven by `score === option.score` (existing `values[criterion.id]` already stores numeric score). Click calls existing `onChangeScore(criterion.id, option.score)` — no service-layer changes.
   - Else: keep the existing 0–5 button row exactly as today.
   - Add the `आपका स्कोर` heading above whichever variant renders.
   - Header badges already use `t('col.weight'…)` etc. — no change needed.
   - Card uses semantic tokens (`border-border`, `bg-card`, amber accent via existing scale) — no raw hex.

4. **Reviewer parity** — same component is reused for Manager/Skip/BU stages; the bilingual + card layout is therefore automatic on every reviewer surface. Manager-side `comparison` chip row stays below the grid as today.

5. **No DB / schema / RLS / workflow change.** Score is still persisted as the numeric `option.score` (0–5), so all downstream math (`computeCriteriaScore`, weighted totals, SystemScoresPanel, snapshots) is untouched.

## Tests
- `src/test/annualReview/criteriaScoringMatrixOptions.test.tsx` (new):
  1. Renders 0–5 button row when `criterion.options` is empty/absent (regression guard).
  2. Renders option-card grid when options present; clicking a card calls `onChangeScore` with the option's `score`.
  3. With `currentLanguage="hi"` + template translations supplied: labels render as `"English / Hindi"`; header badges show `भार / अंक / कुल`; heading shows `आपका स्कोर`.
  4. `readOnly` disables clicks and keeps the currently-selected card visually marked.
- Extend `src/test/annualReview/i18nFallback.test.ts` (or add) to assert `tTemplateBilingual` join + fallback behavior.

## Risk & Impact
- **Data**: none.
- **Workflow / RLS**: none.
- **UI**: net-additive. Legacy criteria (no `options[]`) look identical to today.
- **Regression**: low — gated by `criterion.options?.length > 0`. Existing tests for the button row stay green.
- **Performance**: O(options) per criterion, options are ≤6.
- **Rollback**: revert the 3 touched files; no data cleanup.

## Out of scope
- Editing options inside the template editor (already covered by existing `CriterionOptionsDialog`).
- Changing the numeric scale, weighting math, or persisted shape of `criteria_scores`.
- Bilingual rendering of `criterion.name` / `description` — the mock shows them in Hindi only, and `tTemplate` already handles that.

## Docs / Policy
- `src/modules/annual-review/DOCUMENTATION.md` — append a 2026-06-15 entry describing the option-card variant and the `tTemplateBilingual` helper.
- `src/modules/annual-review/POLICY.md` — one-line note: bilingual joined labels are a **display-only** transparency aid; the persisted score remains the numeric `option.score`.
- `mem://design/annual-review-bilingual-options` (new memory) — short rule: "When `criterion.options` exists and `currentLanguage !== defaultLanguage`, option labels render `EN / translated`; names/descriptions render in active language only."
