# Fix: "Uncategorized" badge in Bulk Scoring KPI detail panel

## Root Cause (RCA)

The detail panel opened from `/review/bulk-scoring` is rendered by `BulkCellDrawer` → `KpiReviewPanel` → `KpiHeaderSection`. The header reads:

```ts
const categoryName = kpi.kra_categories?.name || 'Uncategorized';
```

The KPI object is supplied by the RPC `public.kpi_cell_detail`, which builds the KPI payload as plain `to_jsonb(k.*)` from `public.kpis`. That row has only `category_id` — it does NOT contain a nested `kra_categories` object (no PostgREST-style join is performed in the RPC).

Everywhere else (EmployeeScorecard, KpiDetailsTable, etc.) the KPI is fetched via supabase-js with `kra_categories(*)` embed, so the nested object is present and the category renders correctly. Only the Bulk Scoring drawer path is broken.

This is purely a backend RPC data-shape bug, not a UI bug. The category badge therefore always falls back to "Uncategorized" (and color `#6B7280`) regardless of how the KPI is mapped or how many employees are linked.

## Risk & Impact

- **Data impact**: None. Read-only enrichment of an existing JSONB payload.
- **Workflow impact**: None.
- **UI impact**: Bulk Scoring drawer header will show the real category name + color (matching the Self/Manager scorecards).
- **Regression risk**: Very low — additive field on `v_kpi`. `KpiHeaderSection` already null-guards.
- **Mitigation**: Use `LEFT JOIN` so missing `category_id` still returns the KPI; keep fallback string in UI.
- **Scalability**: Single-row lookup keyed by PK — negligible cost.

## Fix

Update RPC `public.kpi_cell_detail` so `v_kpi` includes a nested `kra_categories` object (id, name, color) resolved from `kpis.category_id`. Implementation:

```sql
SELECT to_jsonb(k.*) 
       || jsonb_build_object(
            'kra_categories',
            CASE WHEN c.id IS NULL THEN NULL
                 ELSE jsonb_build_object('id', c.id, 'name', c.name, 'color', c.color)
            END
          ),
       k.kra_name, k.kpi_name, k.review_period, k.review_year
INTO v_kpi, v_kra_name, v_kpi_name, v_review_period, v_review_year
FROM public.kpis k
LEFT JOIN public.kra_categories c ON c.id = k.category_id
WHERE k.id = p_kpi_id AND k.employee_id = p_emp_id;
```

No other lines of the RPC change. No client/UI changes required.

## Tests

- pgTAP / SQL assertion: call `kpi_cell_detail` on a KPI with a known `category_id` → assert `data->'kpi'->'kra_categories'->>'name'` equals the expected category name; assert NULL when `category_id IS NULL`.
- Manual: open Bulk Scoring → drawer for a categorized KPI → badge shows real category + color.

## Docs / Policy

- `DOCUMENTATION.md`: note that `kpi_cell_detail` embeds `kra_categories {id,name,color}` so all KPI panels share one rendering contract.
- `POLICY.md`: no policy change; add a one-line note under Bulk Review section that detail drawer is data-parity with Self/Manager scorecards.
- ADR / Version History: append "v1.x — kpi_cell_detail now embeds kra_categories (parity fix)".

## Not in scope

- Refactoring `KpiReviewPanel` to fetch category client-side.
- Changing the bulk snapshot RPC (badge in the grid uses a different path and is unaffected).
