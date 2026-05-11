## RCA — "1 Pending" on Cost Management & Optimization vs. card "34 propagated / 0 not propagated"

### What the user sees
- Category header chip: **1 Pending** (and no Propagated chip)
- The only KPI card in that category — *Adherence to Manning Norms* — shows the green **Propagated** pill, **34 employees**, and **34 propagated / 0 not propagated**.
- Two surfaces, two truths → user confusion.

### 5 Whys

1. **Why does the chip say "1 Pending"?**
   `OrgKpiDataEntry.tsx:1770` counts `group.kpis.filter(kpi => getKpiStatus(kpi) === 'pending').length`. For this KPI, `getKpiStatus` returned `'pending'`.

2. **Why did `getKpiStatus` return `'pending'`?**
   It delegates to `deriveOrgKpiTileStatus` in `src/lib/orgKpiStatus.ts`. For non-organization scopes (this KPI is `employee` scope) the function does:
   ```ts
   const matching = okvRows.filter(hasOkvValue);
   if (matching.length === 0) return 'pending';   // ← early return
   ```
   The `org_kpi_values` (OKV) rows for this KPI/period either don't exist or have no `achieved_value` / `is_na`, so `matching` is empty and the function exits with `'pending'` **before** it ever consults the "every child has advanced past kra_set" override.

3. **Why is OKV empty when the children were clearly propagated (34/34)?**
   This is a known, documented condition: legacy propagations, the cross-department resolver RPC, the data-repair RPC and direct admin saves frequently populate `kpis` / `review_submissions` **without** back-filling an `org_kpi_values` row (see ADR-055 and `mem://features/admin/org-kpi-propagation-truth.md`, "OKV row backfill is an opt-in Data-Repair action"). So OKV silence ≠ "nothing was entered".

4. **Why does the card itself show "Propagated 34/34" while the chip says Pending?**
   The card pill and the per-row "X propagated / Y not propagated" summary go through `deriveScopedRowStatus` (`orgKpiStatus.ts`), which — per ADR-055 follow-up (POLICY §111.3, 2026-05-09) — promotes `isPastKraSet` to a first-class signal. The category chip's path (`deriveOrgKpiTileStatus`, employee/department branch) was **not** updated when that fact was promoted, so it still trusts OKV rows alone.

5. **Why wasn't this drift caught?**
   ADR-055 was implemented for the `'organization'` scope only (lines 63-70 of `orgKpiStatus.ts` correctly fall through to `everyChildAdvanced`). The `'employee'` and `'department'` branches kept the old "no OKV value → pending" early return. The unit test `orgKpiTileStatus.test.ts` exercises the org-scope override but not the employee/department-scope override. Result: a regression-shaped gap, not a regression.

### Root cause (one-line)
`deriveOrgKpiTileStatus` applies the ADR-055 fact-based override only for organization scope. For employee- and department-scope Org KPIs it returns `'pending'` whenever OKV rows lack values, even when every mapped child has already advanced past `kra_set` — directly contradicting the per-row pill (`deriveScopedRowStatus`) and the card chip (which already uses the `isPastKraSet` fact).

### Impact
- **Data integrity:** none. Underlying scores, propagations, and `kpis.status` are correct.
- **UX:** Chip vs. card vs. row counter disagree → users open Pending Report, find nothing actionable, lose trust in the surface.
- **Scope:** every employee- or department-scope Org KPI whose OKV row was never back-filled (common for KPIs propagated before ADR-055 or via the cross-department resolver).

---

## Fix Plan

### 1. `src/lib/orgKpiStatus.ts` — extend ADR-055 to all scopes
In `deriveOrgKpiTileStatus`, before the `if (matching.length === 0) return 'pending'` early return for non-organization scopes, apply the same fact-based override the org branch already uses:

```ts
const matching = okvRows.filter(hasOkvValue);
if (matching.length === 0) {
  return everyChildAdvanced ? 'propagated' : 'pending';
}
```

This mirrors the org-scope branch and the per-row `deriveScopedRowStatus` precedence (`isPastKraSet` → propagated). No other branches change.

### 2. `src/test/orgKpiTileStatus.test.ts` — regression tests
Add cases covering the gap:
- **employee scope**, no OKV rows, all 34 mapped children past `kra_set` → expect `'propagated'` (the bug case).
- **employee scope**, no OKV rows, no children advanced → expect `'pending'` (unchanged).
- **department scope**, OKV rows missing values, every child advanced → expect `'propagated'`.
- Sanity: existing org-scope tests still pass.

### 3. `docs/adr/ADR-055.md` — extend scope
Append a 2026-05-11 note: the fact-based override now applies uniformly across `organization`, `employee`, and `department` scopes, eliminating the chip/card/row drift surfaced on the Cost Management & Optimization card.

### 4. `mem/features/admin/org-kpi-propagation-truth.md` — sync
Add a "2026-05-11 chip parity" bullet under POLICY §111: category chip and per-row pill MUST share the `isPastKraSet` precedence. Cross-link the new test.

### 5. `POLICY.md` + `DOCUMENTATION.md`
- POLICY §111.5 — "Org KPI category chip parity": chip aggregator MUST use `deriveOrgKpiTileStatus` with ADR-055 override applied to every scope.
- DOCUMENTATION.md — add v2.66.10.2 entry referencing the RCA above and the regression test.

### Risk & Impact
- **Data:** none — display-only change.
- **Workflow:** none — no propagation, RPC, or RLS path touched.
- **UI/UX:** the "X Pending" chip on Cost Management & Optimization (and any analogous drifted card) will drop to 0 and the matching "Propagated" chip will increment. The `Pending` filter and Pending Report will no longer surface these phantom rows.
- **Regression:** low — the new override only converts a stale `pending` to `propagated` when **every** mapped child has advanced; the `entered` and `stuck` paths are untouched.
- **Mitigation:** four new unit tests pin the matrix (org/employee/dept × advanced/not-advanced × OKV-present/absent).
