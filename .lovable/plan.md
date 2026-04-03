

## Fix: Make KPI Edit Button Discoverable in Bundle Editor

### Problem
The Pencil (edit) button in the Selected Templates list is hidden behind a hover state (`opacity-0 group-hover:opacity-100`). Users cannot discover it — they don't know they can edit a KPI. On touch devices, hover doesn't work at all.

### Fix — 1 file: `src/pages/admin/BundleEditor.tsx`

#### 1. Make the Pencil button always visible
Move the `onEdit` Pencil button **out** of the hover-hidden action group and place it as a standalone, always-visible button next to the expand/collapse chevron. Keep move-up/down and trash in the hover group since those are less frequent actions.

#### 2. Add "Edit" option in the expanded section
When a template row is expanded, add an explicit "Edit Template" button at the bottom of the expanded details panel — a clear, labeled button (not just an icon) so users know they can modify the KPI.

#### 3. Style the Pencil button for visibility
- Use `text-primary` color so it stands out
- Keep it always visible (no opacity transition)
- Add tooltip text "Edit this KPI template"

### Technical Detail

In `SelectedTemplateRow` (around line 558):
- Move the `<Button onClick={onEdit}>` before the hover group div
- Add a full "Edit Template" button inside the `isExpanded` section (around line 573)

### Risk Assessment
- **No risk**: Pure UI visibility change, no logic or data modifications

