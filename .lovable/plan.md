## Problem

The composition card shows `System 0.00 / 100` even though the Carry KRA card below it has clearly fetched `Achieved 99.00 / Out Of 100`.

## Root Cause

`computeScoreComposition` reads the System contribution from `instance.system_scores`. For a `carry_kra` source, that map is **only populated** when `CarryKraScoreCard` calls `onChangeValue` — which it can't on the employee/team pages because we render `SystemScoresPanel` with `readOnly` and no `onChangeValue` prop. The Carry value lives only inside the card's own `useQuery` state.

So:
- The card renders the right number (its own local query).
- The composition reads zero (the persisted map is empty until a writer sets it).
- The Overall and System columns stay at 0.

## Fix (surgical, presentation-only)

Introduce a tiny hook that resolves the *displayed* system-score map by overlaying live carry-KRA fetches on top of `instance.system_scores`. Both the composition card and (transparently) the existing system panel will see the same numbers, with no extra network calls thanks to TanStack Query's `queryKey` dedupe.

### 1. New hook — `src/hooks/useResolvedSystemScores.ts`

- Signature:
  `useResolvedSystemScores(template, instance, fiscalYear): { values: Record<string, number>; isLoading: boolean }`
- For each `template.sections.system_scores[s]`:
  - If `s.source === 'carry_kra'`: call `useQuery` with the **same key** the card uses (`['carryKraScore', employeeId, fiscalYear, cfg, weight]`) so the network request is shared. Use `buildCarrySnapshot` as `queryFn`. Override `values[s.id]` with the resulting `value`.
  - Else: keep `instance.system_scores[s.id] ?? 0`.
- Hooks must be order-stable, so iterate `system_scores` with `useQueries` (TanStack) — one batch per render.
- Returns the merged map and an aggregate `isLoading` flag.

### 2. Wire the hook into the two pages

- `src/pages/annual-review/EmployeeAnnualReview.tsx`: replace `instance.system_scores ?? {}` in the `composition` memo with the hook's resolved `values`. The `SystemScoresPanel` keeps reading raw `instance.system_scores` — its own internal card still does the same fetch and the query cache dedupes it.
- `src/components/annual-review/TeamReviewDetailContent.tsx`: same change for the composition memo.

### 3. Tests

- `src/hooks/useResolvedSystemScores.test.tsx` (new) — render with a mocked `buildCarrySnapshot` returning `{ value: 99, maxValue: 100, rating: 4.95, monthly: [] }`, assert the returned map contains `kra: 99` while a `manual` entry passes through unchanged. Cover the "no carry sources" early-return case (no queries fired).
- `src/lib/annualReview/scoringComposition.test.ts` — add one regression case asserting that when `system_scores` map is populated externally with the resolved value, composition surfaces `System 99/100 / Overall 99/100`. (No code change to `computeScoreComposition` — purely a regression guardrail.)

### 4. Docs

- `src/modules/annual-review/POLICY.md` — append a version-history line: "Composition card reads carry-KRA system scores via `useResolvedSystemScores`, which overlays live `buildCarrySnapshot` results on top of `instance.system_scores`. The persisted map is unchanged; this is a display alignment so the composition reflects what the Carry KRA card shows."
- `mem/features/annual-review/overview.md` — one-line addition noting the resolved-values hook.

## Risk & Impact

- **Data impact:** None. We do not write to `instance.system_scores`. The persisted Overall (computed server-side at finalize) is unaffected.
- **Workflow impact:** None.
- **UI/UX:** The composition card now matches the Carry KRA card the user already sees (99/100 → Overall 99/100 in the screenshot). Brief flash from `0.00` to the real number on first paint while the query resolves (handled by an `isLoading` skeleton inside the card if desired — small follow-up, not blocking).
- **Regression risk:** Low. Same `useQuery` key as the card → cache shared, no duplicate fetch.
- **Scalability:** O(carry_kra count) per render, typically 1.
- **Rollback:** Revert the hook + two-line page edits.

## Out of Scope

- Persisting `instance.system_scores` from the client. That's an admin/server concern and is unaffected by this fix.
- The "Eligibility criteria not met" banner — separate matter (eligibility inputs aren't populated for this employee). Flag for a follow-up if you want me to investigate after this fix lands.
