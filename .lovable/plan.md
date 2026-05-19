# Sort Build Registry groups by match strength

## Change
In `src/components/admin/kpi-standardization/BuildRegistryTab.tsx`, sort `visibleGroups` so the highest-similarity groups appear first — making it easier for the admin to scan from "most similar" down to "least similar".

## Sort key (per group)
For each group, compute a `matchScore`:
- If the group has any `match_type === 'exact'` variant → score = `1` (exact stays at the top).
- Else → score = `max(variant.similarity ?? 0)` across all variants (the strongest fuzzy match).

Sort descending by `matchScore`. Tiebreakers (preserve stable, predictable order):
1. Higher `row_count` first (bigger impact).
2. Higher `variants.length` first.
3. `normalized_kpi` alphabetical (stable fallback).

Skipped groups (`is_skipped`) remain in their existing flow — they're already dimmed and toggle-controlled; we do **not** force them to the bottom (keeps current "Include skipped" UX intact).

## Implementation
- Add a small `groupMatchScore(group)` helper in the same file (or co-locate next to `groupKey`).
- Wrap the existing `filteredGroups`/`visibleGroups` derivation: sort `visibleGroups` with the comparator above before slicing into `pagedGroups`. Memoize via `useMemo`.
- No changes to `useScanDuplicates`, the scanner SQL, dedupe helper, or the variant-level UI badges.

## Tests
Add `src/components/admin/kpi-standardization/buildRegistrySort.test.ts` (pure helper extracted alongside) covering:
- Exact group ranks above any fuzzy group.
- Two fuzzy groups sort by max similarity desc.
- Tie on similarity → higher `row_count` wins.
- Tie on similarity + row_count → alphabetical `normalized_kpi`.

## Risk & Impact
- **Data**: none (read-only presentation).
- **Workflow**: none — same approval flow, only display order changes.
- **UI/UX**: pagination resets are already keyed on `resetKey`; sort change is deterministic per scan so no extra reset needed.
- **Regression**: very low; isolated to one memo + one helper.
- **Mitigation**: unit tests on the comparator lock the contract.
