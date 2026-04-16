

## Add Drag-and-Drop Column Reordering for Import Templates

### Problem
The Import Column Sequence section is currently read-only — admins can see the column order but cannot change it from the UI.

### Target UI

```text
Import Column Sequence
Configure the expected column order for import templates.

KPI Import Template
┌─────────────────────────────────────────────────────────────┐
│ ⠿ 1. Employee Code  ⠿ 2. Full Name  ⠿ 3. Category  ...   │
│                                                             │
│  Drag badges to reorder. Click ↑↓ arrows for fine control.  │
└─────────────────────────────────────────────────────────────┘
                                              [Save Changes]

Employee Import Template
┌─────────────────────────────────────────────────────────────┐
│ ⠿ 1. Employee Code  ⠿ 2. Full Name  ⠿ 3. Email  ...       │
└─────────────────────────────────────────────────────────────┘
                                              [Save Changes]
```

Each badge gets a grip handle and is draggable. Additionally, each badge gets move-left / move-right buttons on hover for keyboard/fine control.

### Changes

**File: `src/components/admin/UploadSettingsTab.tsx`**

1. Convert the column sequence section from a plain `<Card>` to a `<SettingCard>` with Save functionality (save `kpi_import_column_order` and `employee_import_column_order` to `system_settings`).

2. Replace static badge list with a **`DraggableColumnList`** sub-component that:
   - Uses HTML5 drag-and-drop (`onDragStart`, `onDragOver`, `onDrop`) — no external library needed
   - Each badge shows a `GripVertical` icon as drag handle
   - On hover, shows `ChevronLeft` / `ChevronRight` arrow buttons for single-position moves
   - Updates `kpiColumns` / `empColumns` state on reorder
   - Marks the `columns` dirty group

3. Add dirty tracking for `'columns'` group and wire Save button to persist both column orders as JSON arrays.

**No database changes** — the `kpi_import_column_order` and `employee_import_column_order` settings already exist.

**Files: `DOCUMENTATION.md`, `POLICY.md`** — Version bump.

### Risk Assessment
- **Data impact**: None — only updates existing `system_settings` rows
- **Regression risk**: Low — column order is consumed by import validation which already reads from these settings
- **UX improvement**: Admins can customize import template column order without developer intervention

