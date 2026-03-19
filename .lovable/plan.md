

## Root Cause Analysis: KRA Library Changes Not Visible in Dashboard/All KPIs

### Findings

I investigated the template `fdeba115` ("Create and update HR policies") and its linked live KPIs. Here is what I found:

**1. Template vs KPI field mismatch (design bug)**

The template save logic in `TemplateFormDialog.tsx` (lines 266-285) conditionally nullifies fields based on `uom_type`. This template has `uom_type = 'binary'`, so when saved:
- `criteria` is forced to `null` (line 269)
- `r5`, `r4`, `r3`, `r2`, `r1`, `r0` are forced to `null` (lines 272-277)
- `target_value` is forced to `null` (line 267)

But the linked live KPIs still have values from the original import: `r5 = "1"`, `r0 = "zero policy developed"`, `target_value = 1.00`, `criteria = "Higher is Better"`.

The propagation change detection compares template values to form values. Since the template stores NULLs for binary UOMs, subsequent edits cannot detect that these fields differ from the KPIs. The template and KPIs are permanently out of sync.

**2. Prior CORS failures (now fixed)**

Before today's CORS fix, ALL propagation requests from KRA Library were silently blocked by the browser preflight check. Any template changes saved before today were written to the template but never reached the linked KPIs. The propagation log confirms only 2 entries exist (both from today after the CORS fix).

**3. No full-sync mechanism**

There is no way to compare the current template state against all linked KPIs and push all differences. The propagation only pushes changes detected within a single edit session (comparing the template's saved values to the form's current values).

### Fix Plan

| # | Fix | Description |
|---|-----|-------------|
| 1 | **Stop nullifying fields on template save for binary/tiered UOMs** | In `TemplateFormDialog.tsx`, the save payload (lines 266-285) nullifies `criteria`, `r5`-`r0`, and `target_value` when `uom_type !== 'numeric'`. This is wrong — these fields should be saved as-is regardless of UOM type so the template accurately represents the KPI configuration. The form can hide/show these fields based on UOM type, but the save should preserve whatever values were set. |
| 2 | **Add "Sync All Fields" action to KRA Library** | Add a button in the propagation section (visible when a template has linked KPIs) that compares ALL structural fields on the template against a sample linked KPI and shows any discrepancies. The admin can then trigger a full re-propagation of all fields, not just the changes from the current edit session. |
| 3 | **Fix the existing template data** | Run a one-time data fix to populate the template's NULL fields (`r5`, `r0`, `target_value`, `criteria`, `kpi_name`) from the linked KPIs, so the template accurately reflects the current state of the live KPIs. |

### Technical Detail

**Fix 1** — Change the save payload to preserve all fields:
```typescript
// Before (broken): nullifies fields for non-numeric
criteria: formData.uom_type === 'numeric' ? (formData.criteria || null) : null,
r5: formData.uom_type === 'numeric' ? (formData.r5 || null) : null,

// After (fixed): always save what's in the form
criteria: formData.criteria || null,
r5: formData.r5 || null,
target_value: formData.target_value ? parseFloat(formData.target_value) : null,
```

**Fix 2** — Add sync detection in propagation section: query one linked KPI, compare all STRUCTURAL_FIELDS, highlight mismatches, and allow a one-click full re-push.

**Fix 3** — Database update to back-fill template from its linked KPIs (one-time migration or manual script).

