## Root Cause

`KpiScorecardDetail.tsx` derives its visible/export columns from `useResolvedReportFields('RPT-KSD-001', KSD_DEFAULT_FIELDS)`. That resolver's rule: **if any DB rows exist in `report_field_registry` for the report, the code-side defaults are ignored entirely** — DB is authoritative.

DB currently holds 29 rows for `RPT-KSD-001` (company … status), with no `pending_with` entry. The recently added default in code is therefore dropped by the resolver, so:

- The "Pending With (Name)" column is not in `resolvedFields`.
- `handleExport` / `handleRangeExport` iterate `visible = resolvedFields.filter(!is_hidden)`, so the column is absent from the XLSX header list and every row record.
- `ksdValueFor` already handles `pending_with` — the mapping works; the field just never gets included.

## Fix (minimal, additive)

Add a single migration that inserts the missing registry row:

```sql
INSERT INTO public.report_field_registry
  (report_id, field_key, default_label, default_sort, is_required, is_renamable, data_type)
VALUES
  ('RPT-KSD-001', 'pending_with', 'Pending With (Name)', 295, false, true, 'text')
ON CONFLICT (report_id, field_key) DO NOTHING;
```

No code changes needed — `KSD_DEFAULT_FIELDS`, `ksdValueFor`, `toExportRecord`, and both export handlers are already correct. Once the registry row exists, `useResolvedReportFields` will surface it, so the column appears in the on-screen table, filters/sorts, single-month export, and range export.

## Verification

1. Re-query `report_field_registry` and confirm 30 rows including `pending_with`.
2. In UI, reload `/reports/kpi-scorecard-detail`, confirm "Pending With (Name)" column visible at end of table.
3. Click Export → open XLSX → confirm last column is "Pending With (Name)" with values for every row (real names or "Completed" / queue label).
4. Run range export → same check across multi-month sheet.
5. Existing tests (`kpiPendingWith.test.ts`, `kpiPendingWithSummary.test.ts`) remain green.

## Rollback

`DELETE FROM public.report_field_registry WHERE report_id='RPT-KSD-001' AND field_key='pending_with';` — non-destructive, no data loss.

## Docs

Append to DOCUMENTATION.md (ADR-135) and POLICY.md: "New report columns require both a `KSD_DEFAULT_FIELDS` entry AND a `report_field_registry` seed row when DB overrides are already populated for that report."
