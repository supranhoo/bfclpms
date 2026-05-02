## Problem (RCA)

The "Scan for Duplicates" button now returns an **empty list**, even though many similar KPIs still exist (e.g. the "Ensure Fugitive Particulate Matter" KPI shows up in two near-identical forms — `(PM10)` vs `(PM10/AQI)` with slightly different "Description:" text).

Verified via network log (`scan_kpi_duplicate_groups` returns `[]`) and a direct DB inspection: 1,162 distinct `(kra_name, kpi_name)` pairs are still **unaliased**, but the SQL function only emits a group when **the same KPI name appears under two or more different KRA names**:

```sql
HAVING COUNT(DISTINCT s.kra_name) > 1
```

Two consequences:

1. **Near-duplicate KPI names are invisible.** `Ensure Fugitive Particulate Matter (PM10)…` and `Ensure Fugitive Particulate Matter (PM10/AQI)…` differ by a few characters, so `LOWER(TRIM(kpi_name))` produces two different `norm_kpi` values and they never group together.
2. **After approving a canonical entry**, the residual rows for that KPI typically all share **one** KRA — so even if they were unaliased, the `>1 KRA` rule excludes them. The scanner therefore looks "empty" right after approval, which is exactly what the user is seeing.

The earlier reported bug (same KPI re-appearing after approval) and the current "scan returns nothing" bug are **the same root cause**: the scanner uses **strict text equality** for grouping and **strict KRA-multiplicity** as the duplicate signal.

The "Don't merge" option already exists as a button on each group card — it is only visible once the scanner actually returns groups, which is why it appears "missing" today.

## Plan

Make the scanner **fuzzy-aware** so it surfaces near-duplicate KPIs and same-KPI-single-KRA leftovers, without losing the existing exact-match behaviour or the persistent skip list.

### 1. Upgrade `scan_kpi_duplicate_groups` (new migration)

Replace the function so it returns **two kinds of groups**, both filtered through the existing `kpi_scanner_skips` table:

- **Exact group** (today's behaviour): same normalized KPI name, ≥2 distinct KRAs.
- **Fuzzy group** (new): KPIs whose normalized names share a high token-similarity score within the **same category**, even when there is only one KRA. Implementation:
  - Enable `pg_trgm` (already standard in Supabase) and use `similarity()` ≥ a tunable threshold (default `0.55`), combined with shared significant-word count ≥ 2 (stop-words filtered).
  - Group by the **shortest representative name** in the cluster; emit each member as a `variant` with `match_type: 'exact' | 'fuzzy'` and a `similarity` score.
  - A new RPC parameter `p_fuzzy_threshold numeric DEFAULT 0.55` lets admins loosen / tighten matching from the UI.
  - Skip-list logic stays unchanged — `(category_id, normalized_kpi_of_representative)` keys the skip row.

The existing `WHERE NOT EXISTS (...kpi_name_aliases...)` filter is preserved so already-approved variants stay hidden.

### 2. UI updates — `BuildRegistryTab.tsx`

- Add a **Match sensitivity** select (`Strict` / `Balanced` / `Loose` → `0.75 / 0.55 / 0.40`) next to the *Scan* button. Default `Balanced`.
- On each group card, badge each variant with `Exact` or `Fuzzy XX%` so admins can judge confidence before approving.
- When a fuzzy group is approved, the canonical text defaults to the **longest** variant (most descriptive) instead of the first; user can still edit.
- Keep the existing **"Don't merge"** button — and add a one-line hint under the scan button reminding admins it exists ("Use *Don't merge* on a group to permanently hide it; restore from *History & Undo*.").

### 3. Defensive client-side dedup

Extend `dedupeScannerGroups` to also collapse fuzzy duplicates that may overlap across thresholds (same canonical representative + same category).

### 4. Tests + docs

- New unit tests in `src/lib/scanGroupsDedup.test.ts` covering fuzzy-variant tagging and threshold-driven dedup.
- New SQL-shaped test cases in `src/hooks/useScannerSkips.test.ts` for the `match_type` field passing through the hook.
- Update `POLICY.md` §88I and `mem/features/admin/kpi-standardization-registry` to record:
  - "Scanner uses pg_trgm fuzzy matching at a tunable threshold; admins can loosen/tighten per scan."
  - "Don't-merge skips are keyed on the representative variant; loosening the threshold may surface a fuzzy cousin under a new key — that is expected."
- Add `docs/adr/ADR-051.md` capturing the move from strict-equality to similarity-based grouping.

### Risk & Impact

| Area | Impact | Mitigation |
|---|---|---|
| Data | Read-only RPC change; no data writes. Existing `kpi_definitions` / `kpi_name_aliases` / `kpi_scanner_skips` schemas untouched. | Migration only `CREATE OR REPLACE FUNCTION`; reversible by re-deploying the previous body. |
| Workflow | Scanner will surface ~hundreds more groups initially. | Default threshold `Balanced (0.55)` is conservative; admins control sensitivity per scan; "Don't merge" already covers noise. |
| Performance | `pg_trgm` self-join is O(N²) inside a category. Worst category today has a few hundred KPIs → well under 1 s. | Per-category grouping + `similarity()` short-circuit; add `pg_trgm` GIN index on `LOWER(TRIM(kpi_name))` if needed. |
| UI / UX | One new control + per-variant badges. No layout breakage on the 1295×770 viewport. | Reuses existing `Select` + `Badge` primitives. |
| Regressions | Approval, skip, restore, and review flows are unchanged at the data layer. | Existing tests for `useScannerSkips` and `useBuildRegistry` continue to pass; new tests added. |

### Files to be created / changed

- `supabase/migrations/<new>_fuzzy_scan_kpi_duplicate_groups.sql` (new)
- `src/hooks/useKpiRegistry.ts` (extend `useScanDuplicates` to accept a threshold)
- `src/components/admin/kpi-standardization/BuildRegistryTab.tsx` (sensitivity selector, match-type badges, hint copy)
- `src/lib/scanGroupsDedup.ts` + `.test.ts` (fuzzy-aware dedup)
- `src/hooks/useScannerSkips.test.ts` (extend contract)
- `POLICY.md`, `DOCUMENTATION.md`, `mem/features/admin/kpi-standardization-registry`, `docs/adr/ADR-051.md`

Approve to implement.