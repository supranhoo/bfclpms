
# Add Frequency + R0–R5 columns to the Definition Merge Candidates table

## Where
KPI Standardization → **Suggestions** tab → "Definition Merge Candidates" table (`src/components/admin/kpi-standardization/SuggestionsTab.tsx`, ~line 167–245).

This is the table where admins decide whether to merge two canonical KPI definitions (Keep A / Keep B). Today it shows only Category, Definition A, Definition B, Similarity, Aliases count, Linked KPIs count. Without **Frequency** and the **R0–R5 scoring scale anchors**, admins cannot safely confirm a merge — they can't tell whether the two definitions actually measure the same thing on the same scale at the same cadence.

## What the admin will see (one row)

```
Category  Definition A           Definition B           Sim  Freq  R0   R1   R2   R3   R4   R5  Aliases  Links  Actions
HR        Attrition % (left A)   Attrition Rate (B)    0.87  M·M  ≤2   3    4    5    6   ≥7   3/2      8/4    [Keep A][Keep B][×]
                                                              ⚠   ✓    ✓    ✓    ✓    ✓    ✓
```

Rules for each cell:
- `Freq` shows two stacked badges: `A · B`. Same colour when equal, amber + ⚠ icon when different.
- `R0…R5` cells show the **A value over B value** (compact, two-line). Green tick when equal, amber when different, "—" when missing on either side.
- If linked KPIs *within* one definition disagree on a value (e.g. Definition A has 5 KPIs with different R3 thresholds), show the most common value with a small "mixed" dot indicator and a tooltip listing the variants.

This way the merge is safe-by-default: if everything is green ticks, you're merging look-alike rows; if anything is amber, you're warned before clicking Keep A/B.

## Data source

`kpi_definitions` itself only stores canonical names — frequency and R0..R5 live on the linked `kpis` rows (and `kpi_templates`). So we enrich the suggestion RPC server-side, never client-side roundtrips.

### Backend (one migration)

Update `suggest_definition_merges(p_min_similarity, p_limit)` to additionally return, for each side:

```
left_frequency           text         -- mode of linked kpis.frequency
left_frequency_mixed     boolean      -- true if more than one distinct frequency
left_r0..left_r5         text         -- mode of linked kpis.r0..r5
left_r_mixed             boolean      -- true if any of r0..r5 has more than one distinct value
right_frequency / mixed  text/bool
right_r0..right_r5       text
right_r_mixed            boolean
```

Implementation:
- For each candidate pair, compute the mode of `frequency`, `r0`..`r5` over `kpis` joined on `definition_id`.
- Use a CTE with `array_agg(distinct …)` → if `array_length` > 1, set `*_mixed = true` and pick the most frequent value.
- If a definition has 0 linked kpis (rare; orphan canonical entry), fall back to NULL for all enrichment columns and surface a "—" in the UI.
- Indexed read: rely on existing `idx_kpis_definition_id` (or add if missing inside the same migration). One pass; no N+1.

### Frontend

1. **`src/hooks/useRegistrySuggestions.ts`** — extend `DefinitionMergeSuggestion` with the new fields. No behaviour change otherwise.

2. **`src/components/admin/kpi-standardization/SuggestionsTab.tsx`** — replace the current table layout with the enriched layout above:
   - Add `<TableHead>` for Frequency and R0..R5 (six columns, kept narrow with `w-12 text-[10px] tabular-nums`).
   - Per row, render `<CompareCell a={…} b={…} mixedA={…} mixedB={…} />` for each compared cell.
   - Move Aliases / Linked KPIs to the right (still visible) and keep Actions pinned at end with `sticky right-0`.
   - On narrow viewports (< lg) collapse R0..R5 into a single "Scale" cell that opens a small popover showing the full 6-row comparison. Keeps the table usable on laptops.

3. **New tiny component** `src/components/admin/kpi-standardization/CompareCell.tsx`:
   - Inputs: `a`, `b`, optional `mixedA`, `mixedB`, optional `label`.
   - Renders A over B stacked, with equality state (green = equal, amber = differ, muted = either missing), plus a `mixed` dot when applicable.
   - Pure, no data fetching. Unit-testable.

4. **`docs/adr/ADR-064.md`** — short ADR recording: "enriched merge suggestions with frequency + R0–R5 mode aggregates; mixed flag surfaces internal inconsistency".

5. **`mem://features/admin/kpi-standardization-registry`** — append a paragraph: "Definition merge candidates surface Frequency and R0–R5 (mode of linked KPIs) with mixed-warning dots and per-cell equality state."

## Out of scope (call out)
- No change to alias-candidate table — alias candidates don't carry scales/frequency so the same enrichment isn't meaningful there.
- No change to `merge_definitions` itself. Merge semantics stay identical.
- No auto-blocking of merges when frequency/scale differ — purely informational warnings, so admins keep full control (some legitimate merges do reconcile differing historic scales).

## Risk & Impact Report

- **Data impact:** None. RPC returns extra columns; no schema writes.
- **Workflow impact:** None — the Keep A / Keep B / Dismiss flow is unchanged.
- **UI/UX:** Wider table. Mitigated with narrow tabular-nums columns and the lg-breakpoint collapse to a popover.
- **Regression risk:** The RPC signature stays compatible (same args, extra return columns). The hook just maps additional fields; old callers ignoring them keep working. Low.
- **Performance:** Enrichment is a single grouped scan over `kpis` per candidate pair. The result set is capped at 100 by the existing `p_limit`. Negligible cost on the existing index.
- **Mitigation:** Add a Vitest for `CompareCell` (equal / differ / mixed / missing). Smoke test the RPC by running `EXPLAIN ANALYZE` post-migration and confirming no seq scan over `kpis`.

## Files to touch

- New migration (extends `suggest_definition_merges`).
- `src/hooks/useRegistrySuggestions.ts` (extend type).
- `src/components/admin/kpi-standardization/SuggestionsTab.tsx` (table columns + responsive collapse).
- New `src/components/admin/kpi-standardization/CompareCell.tsx`.
- New `src/components/admin/kpi-standardization/CompareCell.test.tsx`.
- `docs/adr/ADR-064.md` (new).
- `mem/features/admin/kpi-standardization-registry` (append).
