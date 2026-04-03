

## Plan: Full-Page Bundle Editor with Enhanced Features

### Current State
The "Edit/Create Bundle" experience is a cramped `Dialog` modal (`BundleFormDialog.tsx`) with limited space for template selection, no search/filter for templates, no drag-and-drop reordering, and no preview of the bundle contents.

### What Changes

**1. New Route & Full-Page Component**
- Add route `/admin/bundles/new` and `/admin/bundles/:id/edit` in `App.tsx`
- Create `src/pages/admin/BundleEditor.tsx` as a full-page editor
- Update `TemplateBundles.tsx` to navigate to the new route instead of opening the dialog

**2. Full-Page Layout (BundleEditor.tsx)**
- **Left Panel (60%)**: Form fields + selected templates with drag-to-reorder
- **Right Panel (40%)**: Template browser with search, category filter, and department filter
- **Sticky Header**: Bundle name, status badge, Save/Cancel buttons, breadcrumb navigation
- **Sticky Footer Bar**: Weightage summary (total %, warning if != 100%), template count, save button

**3. Enhanced Template Selection**
- Search bar to filter templates by title, KRA name, or KPI name
- Filter by KRA category dropdown
- "Select All" / "Deselect All" quick actions
- Selected templates shown in left panel as a sortable list with:
  - Drag handle for reordering (updates `sort_order`)
  - Inline display of weightage, UOM, target, category
  - Remove button per template
  - Running total weightage with color indicator (green at 100%, amber otherwise)

**4. Template Preview Panel**
- Clicking a template in the browser shows an expandable detail card with all fields: rating scale (R0-R5), criteria, frequency, source of data, UOM

**5. Unsaved Changes Guard**
- Track dirty state and show a confirmation prompt when navigating away with unsaved changes

**6. Validation & Feedback**
- Bundle name required
- At least 1 template required
- Weightage total warning (non-blocking) if != 100%
- Toast on save success/failure
- Disable save button while submitting

### Files Modified/Created

| File | Action |
|------|--------|
| `src/pages/admin/BundleEditor.tsx` | **Create** — Full-page editor component |
| `src/App.tsx` | **Modify** — Add `/admin/bundles/new` and `/admin/bundles/:id/edit` routes |
| `src/pages/admin/TemplateBundles.tsx` | **Modify** — Navigate to edit route instead of opening dialog; keep dialog for quick-create if desired |
| `src/components/admin/BundleFormDialog.tsx` | **Keep** — Retained as optional quick-create, or deprecated |
| `DOCUMENTATION.md` | **Update** — Version bump |

### Technical Approach
- Use `useParams` to get bundle ID; fetch via `useTemplateBundle(id)` for edit mode
- Reuse existing `useCreateTemplateBundle` and `useUpdateTemplateBundle` hooks
- Use `@dnd-kit/sortable` (already likely available) or simple move-up/move-down buttons for reordering
- `useMemo` for filtered template list; `useBlocker` or `beforeunload` for unsaved changes guard

### Risk Assessment
- **Low risk**: No schema changes, no RLS changes, read/write patterns identical to existing dialog
- Existing dialog can remain functional as fallback

