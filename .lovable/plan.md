## Goal
On **KPI Standardization → Build Registry**, every variant in a merge group should show **Freq + R0–R5** (plus criteria / UoM context) so admins can confirm at a glance that fuzzy / duplicate KPIs are truly the same metric before merging.

Today the variant card only shows: KRA name, KPI name, employee count, row count, Exact/Fuzzy badge. Frequency and rating scale (R0–R5) are hidden — admins must drill into "View KPIs" to verify, which is what makes finalising hard.

---

## What the new variant card will look like

```text
┌─ Group: "complete all planned monthly preventive maintenance…"  [Fuzzy match]  [10 variants] ┐
│                                                                                              │
│  [A] [Skip]  Preventive Maintenance                                          [Exact]         │
│              Complete all planned monthly preventive maintenance…                             │
│              1 employees · 1 rows                                                            │
│              ┌────────────────────────────────────────────────────────────────────────┐      │
│              │ Freq      R0      R1       R2        R3      R4       R5              │      │
│              │ Monthly   <98%    98%      98.5%     99%     99.5%    100%            │      │
│              │ Higher-is-Better · UoM: %                                              │      │
│              └────────────────────────────────────────────────────────────────────────┘      │
│                                                                                              │
│  [A] [Skip]  Preventive Maintenance                                          [Fuzzy 100%]    │
│              Complete all planned monthly preventive maintenance for critical equipment…     │
│              3 employees · 22 rows                                                           │
│              ┌────────────────────────────────────────────────────────────────────────┐      │
│              │ Freq      R0      R1       R2        R3      R4       R5              │      │
│              │ Monthly   <98%    98%      98.5%     99%     99.5%    100%   ✓ match  │      │
│              │ Higher-is-Better · UoM: %                                              │      │
│              └────────────────────────────────────────────────────────────────────────┘      │
│                                                                                              │
│  [B] [Skip]  Preventive Maintenance (Non-critical)                           [Fuzzy 82%]    │
│              …                                                                               │
│              2 employees · 6 rows                                                            │
│              ┌────────────────────────────────────────────────────────────────────────┐      │
│              │ Freq      R0      R1       R2        R3      R4       R5              │      │
│              │ Monthly   <95%    95%      96%       97%     98%      100%   ⚠ differs│      │
│              │ Higher-is-Better · UoM: %                                              │      │
│              └────────────────────────────────────────────────────────────────────────┘      │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Behaviour
- **Compact 7-column strip** (`Freq · R0 · R1 · R2 · R3 · R4 · R5`) on every variant. Tabular-nums, `text-xs`, monospace-friendly so columns align across variants.
- **Cross-variant comparison highlight.** The first variant in the group is the baseline. Any cell whose value differs from the baseline is shown in **amber** with a small `⚠ differs` chip at the row's end. Matching variants get a faint `✓ match` chip. This is what makes "same KPI or not?" a one-glance decision.
- **Binary / Tiered KPIs.** When the KPI's criteria is `Binary` or `Tiered`, R-cells show the qualitative label instead of a raw number, e.g. `R5: Yes` / `R0: No`, or `R5: Tier 1`, `R3: Tier 3`. Logic reuses `src/lib/qualitativeUom.ts` so display matches the rest of the app.
- **Mixed-within-variant indicator.** If a single variant spans multiple `kpis` rows that disagree on a value (e.g. some rows have `Monthly`, some `Quarterly`), show a small amber dot next to that cell with tooltip *"Underlying KPIs disagree — N rows show X, M show Y"*. Same idea as `CompareCell` in the Suggestions tab.
- **Context line** below the strip: `Higher-is-Better · UoM: %` (or `Lower-is-Better · UoM: count`). Pulled from `kpis.criteria` + `kpis.uom` (mode).
- **Missing data** renders as `—` muted (some legacy KPIs have no R0).
- No new tabs, no new pages — purely additive to the existing variant rows in **Build Registry**.

---

## Technical details

### 1. DB — extend `scan_kpi_duplicate_groups`
Migration adds these per-variant fields (mode across the kpis rows that match the variant):
- `frequency text`, `r0..r5 text`, `criteria text`, `uom text`
- `*_mixed boolean` flags for `frequency`, `criteria`, `uom`, and each `r0..r5` — true when the underlying `kpis` rows disagree.

Implementation: in the existing variant CTE, wrap each column in `mode() WITHIN GROUP (ORDER BY col) AS col` and add `(COUNT(DISTINCT col) FILTER (WHERE col IS NOT NULL)) > 1 AS col_mixed`. No change to grouping keys, fuzzy logic, skip filtering, or alias-aware exclusion — the §"Scanner invariant" and §"Grouped-column rule" contracts in `mem/features/admin/kpi-standardization-registry` stay intact. Function signature gains no new parameters.

### 2. Types
- `src/lib/scanGroupsDedup.ts` → extend `ScannerVariant` with the new optional fields. `dedupeVariants` keeps the first-seen values (variants are already deduped by key, so this is a no-op in practice).
- `src/hooks/useKpiRegistry.ts` → `DuplicateGroup` inherits via `ScannerVariant`.

### 3. New component — `src/components/admin/kpi-standardization/VariantScaleStrip.tsx`
Props: `{ variant: ScannerVariant; baseline?: ScannerVariant }`. Renders the 7-column strip + context line + match/differs chip. Uses `qualitativeUom.ts` to translate numeric thresholds to Binary/Tiered labels when applicable. Pure presentational — unit tests in `VariantScaleStrip.test.tsx` cover:
  - numeric Higher-is-Better display
  - Binary label translation (R5=Yes / R0=No)
  - Tiered label translation
  - differs vs match highlighting against a baseline
  - mixed-cell indicator dot
  - missing R-value fallback to `—`

### 4. `BuildRegistryTab.tsx` integration
Single insertion point inside the existing `group.variants.map(...)` block (around line 380–410), right under the `employee_count / row_count / Exact|Fuzzy` badge row:

```tsx
<VariantScaleStrip
  variant={variant}
  baseline={group.variants[0]}
/>
```

No changes to bucket assignment, Skip logic, canonical edit, approval flow, or `summarizeBuckets`.

### 5. Memory + docs
- Append a section to `mem/features/admin/kpi-standardization-registry` ("Variant scale strip — Build Registry, May 2026") describing the new strip, mixed-indicator semantics, and the mode/mixed contract on the RPC.
- New ADR-066: *Variant Frequency + Rating Scale visibility in Build Registry*.

---

## Risk & Impact
- **Data Impact:** Read-only RPC extension. No schema change, no data writes. Forward-only KPIs unaffected. Pre-May-2026 freeze unaffected (this RPC already only scans May-2026+ rows for variant detection).
- **Workflow Impact:** None — purely informational; approval flow, bucket logic, skip flow, undo all unchanged.
- **UI/UX:** Variant rows grow ~24px taller. Within current Build Registry layout budget. No new tabs.
- **Regression Risk:** Low. RPC change is additive columns + mode aggregates over already-grouped CTE → cannot affect group emission. Defensive `dedupeScannerGroups` already tolerates extra fields. Suggestions tab's `CompareCell` (recently added) is untouched.
- **Mitigation:** RPC change wrapped in a single migration; new component is fully unit-tested; mixed-flag tooltips disclose any underlying drift so admins are never misled by a single "mode" value.
