# BU Console: KPI layer rebuilt on the split (title / description / formula / scoring)

Verified against live data (August 2026 scope) before writing this.

## What is broken or weak today (verified)

1. **The KPI drawer fails to open.** `bu_console_kpi_detail` builds its `scoped` CTE from `kpis k` (which has its own `business_unit_id`) *and* adds `d.business_unit_id` from departments. Two columns of the same name reach the outer select, so Postgres raises `column reference "business_unit_id" is ambiguous`. Every KPI drill-down under a KRA is dead right now.
2. **KPI nodes are labelled with the whole blob.** `bu_console_tree` groups by `normalize_kpi_text(kpi_name)` and shows that raw text, so a row reads "On-Time Submission of MIS Reports: - Description: ... - Formula: ... - Scoring Logic: (...)". Unreadable in a dense row list.
3. **Near-identical KPIs split into separate nodes.** For August 2026: 1,015 KPI nodes by raw name vs **901** when grouped by the structured title — 114 nodes are the same KPI written slightly differently.
4. **Per-employee variation is real and currently invisible.** Of the 901 title groups, 365 span more than one employee row, and within those: 37 have different formulas, 52 different scoring logic, 40 different descriptions, 37 different targets, 196 different weightages. Today the console silently shows one arbitrary text (`max(kpi_name)`) for the whole group.

All 2,811 August 2026 rows are already structured (`kpi_title` populated), so the split is usable for this cycle. Older years stay on the legacy path.

## How the KPI layer should look

Under **Category -> KRA**, each KPI row becomes:

```text
01  On-Time Submission of MIS Reports                     EMPLOYEES  VARIANTS  WEIGHTAGE  AVG SCORE   >
    Ensures timely submission of all required MIS reports      2     1 formula    5%        3.4 / 5
```

- **Title only** on line one (from `kpi_title`, falling back to today's `getKpiSummaryText(kpi_name)` for unstructured rows — same resolver as ADR-269b, no second parser).
- Muted second line = short description, clamped to one line.
- Metric columns reuse `ConsoleMetricRow`: employees mapped, **variants**, weightage (single value, or "3 values"), avg score.
- A **variants** chip appears only when the group's rows disagree on formula, scoring logic, description, target or weightage. Clicking it expands the group into variant sub-rows, each showing the differing part and its employee count. No variant is ever hidden behind a `max()`.
- Legacy (unstructured) rows keep exactly today's rendering.

### KPI drawer

Header shows Title, then labelled **Description / Formula / Scoring Logic** blocks (`KpiTextBlocks` from ADR-269b) instead of the current single blob. Where the group has variants, the header shows the definition of the selected variant plus a variant switcher, and the employee table gains a **Variant** column so a reviewer can see which employees sit on which formula. Existing paging (200/page with true total, ADR-264) is unchanged.

### Group actions

Group value entry and group approval keep operating on the **selected node**. When a node has variants and the admin has not picked one, the confirm step states "this writes across N formula variants" and lists them. Choosing a variant narrows the write set to those rows. No change to what a write does per employee.

## Implementation

**Database (one migration, function bodies only, no schema change)**

- `bu_console_kpi_detail` — qualify the ambiguous column (`d.business_unit_id AS business_unit_id`, replace `k.*` with an explicit column list), and return the four structured columns plus a `variant_key` per row. Fixes the drawer.
- `bu_console_tree` — group the KPI level by `(category_id, kra_key, title_key)` where `title_key = normalize_kpi_text(coalesce(kpi_title, kpi_name))`, and return per node: `kpi_title`, `kpi_description`, `variant_count`, `weightage_values`, `is_structured`, plus a `variants[]` array (`variant_key`, formula, scoring, description, target, weightage, row/employee counts, and the `kpi_name` list the existing group RPCs need).
- `bu_console_group_write` / `bu_console_group_advance` — accept an optional `p_variant_key`; when absent, behaviour is byte-identical to today. Preview counts already report totals (ADR-264) and now also break down by variant.

**Frontend**

- `BuConsoleTree.tsx` — render KPI rows via `KpiTitle` + description sub-line, add the variants chip and expandable variant sub-rows. Virtualization threshold unchanged.
- `KpiDetailDrawer.tsx` — `KpiTextBlocks` header, variant switcher, Variant column in the employee table.
- `GroupValueEntryDialog.tsx` / `GroupApprovalDialog.tsx` — variant selector plus the multi-variant warning line.
- `useBuConsole.ts` — types for the new node/variant shape and the optional variant key on the two group mutations.

## Risk and impact

- **Data:** read-path change only; no row migration, no writes to `kpis` / `review_submissions`. `kpi_name` stays the join key everywhere.
- **Workflow / permissions:** untouched — same `bu_console_can_read` gate, same admin-only writes, same per-employee workflow resolution.
- **Regression risk:** the group RPCs are the sensitive part. Mitigated by keeping `p_variant_key` optional and defaulting to today's exact write set.
- **Scalability:** grouping is an aggregate (901 nodes for a full month), variants are small and returned inline; paging and virtualization unchanged.
- **Rollback:** re-deploy the previous function bodies and revert the four components.

## Tests

- Ambiguity regression: `bu_console_kpi_detail` returns rows for a KPI mapped to employees in a BU (currently errors).
- Title grouping collapses two differently-worded rows of the same title into one node and reports `variant_count = 2`.
- A group whose rows differ only in weightage counts as one variant for write purposes but surfaces "3 values".
- Group write with a variant key writes only that variant's rows; without one, the write set matches the pre-change set exactly.
- Unstructured (pre-July-2026) rows render through the legacy resolver and report `is_structured = false`.

## Docs

ADR-270 in `DOCUMENTATION.md`; `POLICY §BU-CONSOLE-KPI-NODE` — a console KPI node is keyed by structured title, must never display a `max()` of disagreeing text, and must declare its variant count before any group write.