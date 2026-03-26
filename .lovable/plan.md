

## Make Category/KRA/KPI Editable After Quick Search Library Selection

### Problem
When selecting from the KRA Library Quick Search panel, the Category, KRA, and KPI fields are auto-filled but remain in **combobox/dropdown mode**. The user cannot directly edit the text values — they would need to manually click "+ Enter custom KRA/KPI name" to switch to editable text inputs. This defeats the purpose of the quick search auto-fill workflow.

### Root Cause
In `AdminKpiCreateDialog.tsx`, the `onSelectCategory`, `onSelectKra`, and `onSelectKpi` callbacks set the field values (`setCategoryId`, `setKraName`, `setKpiName`) but do **not** set `isCustomKra = true` and `isCustomKpi = true`. Since those flags stay `false`, the fields render as read-only combobox buttons instead of editable `<Input>` / `<Textarea>` components.

### Fix — `src/components/admin/AdminKpiCreateDialog.tsx`

In the three Quick Search callbacks (lines 369-425):

1. **`onSelectKra`** callback: Add `setIsCustomKra(true)` after setting `setKraName(kra)`, and add `setIsCustomKpi(true)` after setting `setKpiName(...)` so both KRA and KPI fields become editable text inputs.

2. **`onSelectKpi`** callback: Add `setIsCustomKra(true)` and `setIsCustomKpi(true)` so both fields are immediately editable after selection.

3. **`onSelectCategory`** callback: When a category is selected and KRA/KPI are auto-filled from a matching template, also set `setIsCustomKra(true)` and `setIsCustomKpi(true)`.

Category itself uses a Popover-Command combobox that already allows re-selection, so no change needed there.

### Result
After selecting any item from Quick Search Library, all auto-filled fields (KRA name, KPI name, targets, thresholds, etc.) will be **immediately editable** inline — the admin can modify any value before assignment.

### Risk Assessment
- **Data Impact**: None — form state only, no schema changes
- **Workflow Impact**: None — additive UX improvement, existing manual flow unchanged
- **Regression Risk**: Zero — only adding two `setState` calls in existing callbacks

### Files Changed
1. **`src/components/admin/AdminKpiCreateDialog.tsx`** — Set `isCustomKra(true)` and `isCustomKpi(true)` in Quick Search Library callbacks
2. **`DOCUMENTATION.md`** — Version history update
3. **`POLICY.md`** — Version history update

