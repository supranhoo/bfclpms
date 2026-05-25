# Bulk Scoring — 3 UX Enhancements

Three additive enhancements to `/review/bulk-scoring`. Pure frontend (no RPC signature changes, no schema changes). Selections persist in URL query params.

---

## 1. Multi-select + Search Filters

Convert the existing single-select filter buttons in `BulkReviewDashboard.tsx` Row-2 (Company, Division, BU, Department, Category, KRA) to a searchable multi-select combobox.

**Component:** new `src/components/review/MultiSelectFilter.tsx`
- Built on shadcn `Popover` + `Command` (search input + checkboxes), matches Period/Year button style.
- Trigger shows: icon + label + count badge (`"BU · 3"`) when ≥1 selected; "All <Label>" when empty.
- Internal "Select all visible / Clear" actions; keyboard-friendly; `shrink-0` to keep no-wrap row from `v2.66.12.8`.
- Frequency, Period, Year, View-Mode pill stay single-select (unchanged).

**State shape:** filter values become `string[]` (empty = "all"). Local `filters` in `BulkReviewDashboard` already has the right keys; we widen the types and adapt the existing client-side row filter (`useMemo` over `rawRows`) to use `Array.includes` per axis. `kraName` becomes `kraNames: string[]` and the existing reset effect (kra reset on category change) prunes invalid selections instead of clearing wholesale.

**Server-side:** `bulk_scope_preview` / `bulk_review_snapshot` keep current signatures; multi-selection is applied **client-side** on the already-loaded snapshot (same pattern as KRA today). 25k-cell cap still gates Load Scope using the broadest scope (first selected company etc., or unfiltered if any axis is empty). Acceptable because snapshot is already paginated to a single category at most, and the cap protects payload size.

---

## 2. Org KPI Indicator + Mapping-Gap Flag

**Goal:** Show next to each KRA/KPI label whether it is mapped to an Org KPI; flag inconsistencies where some employees in the row have the mapping and others don't.

**Data approach (no RPC change):**
Org KPIs are matched by the canonical key `(category_id, kra_name_normalized, kpi_name_normalized, review_period, review_year)` — same key used in `src/lib/orgKpiKey.ts`. We add a new lightweight hook `useBulkOrgKpiIndex(period, year, categoryIds)`:
- Reads `org_kpi_values` (only `id, category_id, kra_name, kpi_name, employee_id, is_org_level` etc.) for the loaded period/year scoped to categories present in the snapshot.
- Builds a `Map<orgKey, { orgKpiId, mappedEmployeeIds:Set<string> }>`.
- Plus pulls `kpis.is_org_level` per `kpi_id` from the snapshot rows themselves (already in `kpis` table — extend `bulk_review_snapshot` SELECT to include `is_org_level` and `kpi_group_type` only if not already; **if RPC change needed, do it as additive column only**; otherwise read `is_org_level` via a small follow-up `kpis` select keyed by snapshot's distinct `kpi_id`s — RLS-bypassed via existing SECURITY DEFINER `org_kpi_values` access, or a tiny new `rpc_kpi_org_flags(kpi_ids[])`).

**UI in `BulkReviewVirtualGrid` (KPI column cell):**
- Green pill **`ORG`** when the KPI is mapped as Org KPI for **all** employees in that row.
- Amber pill **`ORG · gap`** when mapped for some but not all employees in the visible row. Tooltip lists missing employees (max 5 + "and N more").
- No pill when KPI is not org-level for any employee.
- Click on pill opens existing `BulkCellDrawer` in "Org KPI" tab (new tab) showing the linked `org_kpi_values` row (read-only) — reuses `KpiReviewPanel`'s org section. If drawer integration is too heavy, fall back to a `Sheet` showing just the org KPI summary.

**Gap detection rule:**
For each KPI row (one `kpi_name` × `kra_name` × `category` across all employee columns):
```text
mappedSet = employees whose (kpi_id) has is_org_level=true OR appears in org_kpi_values for this canonical key
visibleSet = employees rendered in the row
gap = mappedSet ⊊ visibleSet AND mappedSet not empty
```
Reuses `deriveOrgKpiCounts` from `src/lib/orgKpiCounts.ts` for count semantics.

---

## 3. KRA Group Expand / Collapse

**Visual model:** Insert a sticky **group header row** per KRA in `BulkReviewVirtualGrid`. Chevron button on the left, KRA name, aggregate badges (# KPIs, total weightage, Org-KPI count, Δ>1 count). Below it, the KPI rows for that KRA. Collapsing the KRA hides its KPI rows entirely from the virtualizer.

**Implementation:**
- Pre-process `rows` into a flat list of `{ kind: 'kra'|'kpi', ... }` items sorted by `kra_name` then `kpi_name`. Virtualizer row height switches per kind (44 px header / 36 px KPI).
- New `collapsedKras: Set<string>` state in `BulkReviewDashboard`, serialized to URL as `cKras=a,b,c`.
- Toolbar adds **Expand all / Collapse all** icon buttons next to the existing Refresh pill.
- Frozen left column header cell respects collapse state (no employee scores rendered for collapsed groups, just the header row spans).
- KPI count in the top stat strip stays unchanged (counts all KPIs, not just visible).

---

## URL Persistence

Extend the existing dashboard view-persistence pattern (`mem://features/review/dashboard-view-persistence`) so on mount we hydrate from URL and on change we replace URL state (debounced). Keys:
- `companies, divisions, bus, depts, cats, kras` (csv of ids)
- `cKras` (csv of collapsed KRA names, base64-safe-encoded)
- `q` (search text — already wired)
- Period/Year/Frequency/ViewMode — already persisted

Empty params are stripped from URL.

---

## Files Touched

```text
src/components/review/MultiSelectFilter.tsx          NEW
src/components/review/BulkReviewDashboard helpers    (filter row swap, URL sync)
src/pages/review/BulkReviewDashboard.tsx             (state shape: string→string[], group state)
src/components/review/BulkReviewVirtualGrid.tsx      (group rows, org pill, collapse rendering)
src/components/review/BulkCellDrawer.tsx             (optional: org-kpi tab)
src/hooks/useBulkReview.ts                           (new useBulkOrgKpiIndex hook)
src/hooks/useBulkOrgKpiIndex.ts                      NEW (if extracted)
src/lib/bulkUrlState.ts                              NEW (csv encode/decode helpers + tests)
src/lib/bulkUrlState.test.ts                         NEW
src/lib/orgKpiGap.ts                                 NEW (gap detection pure fn + test)
src/lib/orgKpiGap.test.ts                            NEW
DOCUMENTATION.md                                     (v2.66.13 entry)
mem/features/review/bulk-review-dashboard            (append §Multi-select/Org-pill/Group sections)
```

No DB migration. No RPC signature change (a small additive `rpc_kpi_org_flags(uuid[])` is optional; if added, it ships as SECURITY DEFINER read-only).

---

## Risk & Impact

- **Data:** None. Read-only additions; existing snapshot/preview unchanged.
- **Workflow:** None — purely view/filter affordances.
- **UI/UX:** Filter row keeps no-wrap rule (`v2.66.12.8`); sticky KPI column behavior (`v2.66.12.11`) preserved. Group header rows are sticky-left + zebra background to match.
- **Performance:** Multi-select filter still client-side over already-capped 25k cells. Org index pulls at most 1 row per (category × kpi name × period) — bounded by snapshot size; uses `staleTime: 5min`.
- **Regression risk:** Low — filter trigger swap is the highest-touch area; covered by URL roundtrip tests + a smoke render test on `MultiSelectFilter`.
- **Rollback:** Flip new components back to single-select by reverting `BulkReviewDashboard.tsx` and removing the new hook — no data leftovers.

---

## Tests

- `bulkUrlState.test.ts` — encode/decode roundtrip, empty pruning, special chars in KRA names.
- `orgKpiGap.test.ts` — full match → green; partial → gap with missing employee list; empty mapped → no pill.
- `MultiSelectFilter` render test — search filters options, checkbox toggles emit array, "Clear" empties.

---

## Out of Scope

- Server-side multi-select pushdown into `bulk_scope_preview` (future if cap becomes a bottleneck).
- Editing org KPI values from the drawer (still read-only here).
- Saving filter presets per user.
