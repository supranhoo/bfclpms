

## Fix: Template-to-KPI Sync Cycle — Permanent Data Loss Loop

### Problem Found

The template `fdeba115` still has `r5=null`, `r0=null`, `target_value=null` even after the back-fill. Every time the admin opens and saves this template, the form loads nulls as empty strings, then saves them back as nulls — overwriting any back-fill. The change detection never flags these fields because it compares `null` to `null`. The "TEST" prefix on `kpi_name` also never reached Dummy's live KPIs because propagation was OFF.

This is a **permanent desync loop** that affects all binary/tiered templates whose fields were originally nullified.

### Fix Plan

| # | Change | File |
|---|--------|------|
| 1 | **Back-fill template from linked KPIs (again, properly)** | Database one-time update |
| 2 | **Prevent null overwrite on save** | `TemplateFormDialog.tsx` |
| 3 | **Auto-detect drift and warn** | `TemplateFormDialog.tsx` |

### Detail

**Fix 1 — Database back-fill**
Update template `fdeba115` (and any other templates with the same issue) to pull `r5`, `r0`, `target_value`, `kpi_name` from their linked KPIs. This time we also revert the test `kpi_name` back to the correct value.

```sql
UPDATE kpi_templates SET
  r5 = '1', r0 = 'zero policy developed', target_value = 1.00
WHERE id = 'fdeba115-bb07-4fa1-a132-36878be343b4'
  AND r5 IS NULL;
```

Also revert the "TEST" prefix from the template's `kpi_name` to match the live KPIs.

**Fix 2 — Prevent null overwrite loop** (in `TemplateFormDialog.tsx`)

When loading a template into the form, if a field is null on the template but the template has linked KPIs, fetch one linked KPI and use its values as fallback for the form fields. This way:
- The form shows the actual values employees see
- Saving preserves them instead of writing nulls
- Change detection works correctly

Implementation: In the `useEffect` that initializes formData from template (line 84-121), add a secondary data source from the first linked KPI when template fields are null.

**Fix 3 — Drift warning in dialog footer**

When the form loads and detects that any structural field on the template is null while linked KPIs have non-null values, show an info banner: *"Some template fields are out of sync with live KPIs. Saving will update the template to match."* This uses the existing `useLinkedEmployees` hook data.

### Files Changed
- `src/components/admin/TemplateFormDialog.tsx` — form initialization fallback + drift banner
- Database — one-time data fix for template `fdeba115`

### What This Fixes
- Dummy's KPI will match the template after the next propagation
- Future template saves will never re-null fields that employees actually have
- The "TEST" prefix will be cleaned from the template name

