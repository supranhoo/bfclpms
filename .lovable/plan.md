## Problem (RCA)

Clicking **Clear Entry** on the Org KPI Data Entry card shows a toast `"0 rows removed — KPI back to Pending."` but the card still shows `15 / 19 entered`. The deletion silently no-ops.

### Root cause: KPI name variant drift

The `kpis` table contains multiple near-identical variants of the same KPI name that differ by trivial whitespace, dashes, or `%` characters embedded in long descriptions. For example, for *Proactive Safety Reporting (UA, UC, & Near Miss)* in April 2026 (Safety & Health), the database holds **3 distinct `kpi_name` strings** (verified via SQL):

- `"… - Formula: …"` (with leading dash) — 17 values entered
- `"… Formula: …"` (no dash) — 1 value
- `"… Rating 5: 150% …"` (with `%` signs) — 4 values

`useOrgLevelKpis` deduplicates these into a single card using a normalized key (`lowercase + whitespace-collapsed`), so the card represents **all 3 variants** and counts `19` employees across them. But:

- The card stores only ONE raw `kpi_name` string (whichever variant was first in iteration).
- `useClearOrgKpiEntry` does a strict `.eq('kpi_name', kpiName)` against `org_kpi_values`.
- Result: only rows matching that one exact variant are deleted; rows stored under the other variants are untouched. In the user's case, the picked variant happened to have **0 rows** in `org_kpi_values`, so the toast read `0 rows removed`.

The same defect class also affects `useUnmarkAsOrgLevel` and any other writer that uses strict `.eq('kpi_name')` on org-level data.

## Fix

Make the Clear Entry hook **variant-aware** — match all `kpi_name` strings whose normalized form equals the card's normalized name, scoped to the same `category_id`, period, and year.

### Strategy

1. **Resolve all variant `kpi_name` strings** at clear time by querying `kpis` for distinct `kpi_name` where `is_org_level = true`, `category_id`, `kra_name`, `review_period`, `review_year` match — then filter client-side by normalized equality with the card's `kpi_name`.
2. **Delete `org_kpi_values`** using `.in('kpi_name', variantList)` instead of `.eq()`.
3. Keep the same `category_id + kra_name + period + year` scoping to avoid touching unrelated KPIs.
4. Return the actual deleted row count so the toast accurately reflects what was cleared.

### Technical changes

- **`src/hooks/useOrgKpiValues.ts`** — `useClearOrgKpiEntry`:
  - Add a normalize helper `nk(s) = s.toLowerCase().replace(/\s+/g, ' ').trim()` (mirrors the one already used in `useOrgLevelKpis.ts`).
  - Step 1: `SELECT DISTINCT kpi_name FROM org_kpi_values WHERE category_id = ? AND kra_name = ? AND review_period = ? AND review_year = ?`. Filter rows where `nk(row.kpi_name) === nk(params.kpiName)` to get `variantNames[]`.
  - Step 2: `DELETE FROM org_kpi_values WHERE category_id = ? AND kra_name = ? AND kpi_name IN (variantNames) AND review_period = ? AND review_year = ?` with `{ count: 'exact' }`.
  - Edge case: if `variantNames.length === 0`, skip the delete and toast `"No entered values found for this KPI."` (truthful no-op message instead of misleading "back to Pending").
  - Keep existing cache invalidations (`org-kpi-values`, `org-kpi-value`, `org-level-kpis-with-employees`).

- **No UI changes** required in `OrgKpiEntryCard.tsx` — the button and dialog already work; only the underlying delete needs to match correctly.

- **No DB migration** required for the immediate fix. The deeper data-quality issue (variant drift in `kpis.kpi_name`) is governed by the existing **KPI Standardization Registry** (mem) and is out of scope for this bug fix — that is the long-term canonicalization path.

### Risk & Impact

- **Data**: Restricted to `org_kpi_values` rows that match `(category_id, kra_name, normalized kpi_name, period, year)`. No risk of cross-KPI collateral because `category_id` and `kra_name` remain strict equality, and we only fan out the `kpi_name` filter to variants that already share the normalized key the card itself uses to render.
- **Workflow**: Clear remains admin-only behind the existing `AlertDialog` and governance lock; behavior on `pending`/`propagated`/`approved` cards is unchanged.
- **Regression**: Other call sites are untouched. If a single canonical `kpi_name` exists, the new logic still resolves to one variant and behaves identically to today.
- **Mitigation**: The hook already invalidates `org-level-kpis-with-employees`, so the `15 / 19 entered` badge will refresh to reflect the true deletion. Toast text is updated to reflect the no-op case truthfully.

### Out of scope (followups, not in this fix)

- Applying the same variant-aware match pattern to `useUnmarkAsOrgLevel` (silently affected by the same drift).
- Backfilling `kpis.kpi_name` to a single canonical string per (category, kra) — belongs under the KPI Standardization Registry workstream.
