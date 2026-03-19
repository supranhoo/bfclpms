

## Fix: KRA Library Edit Template Dialog — Layout & Propagation Visibility

### Issue 1: Cramped Dialog Layout

The dialog uses `max-w-2xl` (672px) and `max-h-[60vh]` for the scroll area. With all the fields (identity, UOM type cards, metrics, binary polarity, source, advanced settings, propagation section), everything is stacked tightly in a narrow column. The screenshot confirms fields are visually crushed together.

### Issue 2: KPI Changes Not Reflecting on Dashboard

The template save only writes to the `kpi_templates` table. Linked KPIs in the `kpis` table are **separate records** that only update when the admin explicitly toggles the "Propagate Changes to Linked KPIs" switch (which defaults to OFF and is buried at the bottom of the dialog). The user likely saved the template without enabling propagation, so the change never reached Dummy's actual KPI.

### Plan

| # | Change | Detail |
|---|--------|--------|
| 1 | **Widen dialog** | Change `max-w-2xl` → `max-w-4xl` and `max-h-[60vh]` → `max-h-[70vh]`. This gives ~896px width — room for 2-column layouts without cramping. |
| 2 | **2-column grid for identity fields** | KRA Name + KPI Name already use grid-cols-2. Extend this pattern: Category + Criteria in one row, Weightage + Frequency in one row. Add proper spacing (`gap-6` between sections instead of `gap-4`). |
| 3 | **Better section separation** | Add subtle section headers ("Measurement", "Scoring", "Advanced") with spacing. Replace bare `<Separator />` with labeled dividers so the form reads as organized groups, not a wall of inputs. |
| 4 | **Auto-enable propagation prompt** | When the user is editing a template with linked KPIs and has made structural changes, show an inline amber banner above the footer: *"You changed {N} fields. These changes only apply to the template — toggle Propagation to update {X} linked employees."* This makes it impossible to miss. |
| 5 | **Move propagation toggle to footer area** | Instead of burying the propagation switch deep inside the scrollable area, place a prominent propagation indicator near the Save button. When changes are detected and propagation is OFF, the save button label shows "Update Template Only" (making it clear KPIs won't update). When ON, it shows "Save & Propagate". |

### Files Changed

- `src/components/admin/TemplateFormDialog.tsx` — all changes are in this single file

### What This Does NOT Change
- No database changes
- No edge function changes
- No changes to propagation logic itself (that already works post-CORS fix)
- `OrgKpiObservationsSummary`, other admin components — untouched

