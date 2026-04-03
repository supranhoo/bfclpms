

## Plan: Add "Edit Template" Button to Selected Templates in Bundle Editor

### Problem
Users cannot edit a KPI template directly from the "Selected Templates" list in the Bundle Editor. They must navigate away to the Templates page to make changes.

### Solution — 1 file change

**`src/pages/admin/BundleEditor.tsx`**

1. **Import `TemplateFormDialog`** from `@/components/admin/TemplateFormDialog`
2. **Add state** at the `BundleEditor` level: `editingTemplate: KpiTemplate | null`
3. **Add an Edit button** (pencil icon) to `SelectedTemplateRow`'s action buttons (next to move up/down and trash) — pass an `onEdit` callback
4. **Render `TemplateFormDialog`** at the page level, passing `editingTemplate` as the `template` prop
5. **On close**, set `editingTemplate` to null — the existing `useKpiTemplates` query will auto-refetch and the selected templates list will reflect any changes

### Technical Detail
- `SelectedTemplateRow` gets a new `onEdit: () => void` prop
- A `Pencil` (or `Settings`) icon button is added in the hover-action group, before the trash button
- `TemplateFormDialog` already handles both create and edit modes — passing an existing template triggers edit mode with full propagation support
- No schema changes needed

### Risk Assessment
- **No risk**: Reusing an existing, well-tested dialog component with no schema or RLS changes

