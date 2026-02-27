

# KRA Export Feature -- Configurable & Admin-Controlled

## Overview

Build a fully configurable KRA Download/Preview/Email feature where the admin controls **which roles** can access each action (Preview, Download, Email) and **which columns** appear in the exported PDF. This follows the same proven pattern as the existing **Report Access Control** system.

---

## Architecture: Two Layers of Control

### Layer 1: Feature Access Control (New `workflow_settings` rows)

Add new rows to the existing `workflow_settings` table to control the KRA export feature. No new tables needed.

| Setting Key | Category | Label | Default Value |
|---|---|---|---|
| `kra_export_enabled` | `export` | Enable KRA Export | `true` |
| `kra_export_preview_roles` | `export` | Roles allowed to Preview KRA | `["admin","manager","employee","auditor","management","hr_pms","skip_level"]` |
| `kra_export_download_roles` | `export` | Roles allowed to Download KRA | `["admin","manager","employee","auditor","management","hr_pms","skip_level"]` |
| `kra_export_email_roles` | `export` | Roles allowed to Email KRA | `["admin","manager"]` |

### Layer 2: PDF Content Configuration (New `workflow_settings` rows)

Control which columns appear in the exported KRA sheet:

| Setting Key | Category | Label | Default Value |
|---|---|---|---|
| `kra_export_columns` | `export` | Visible columns in KRA PDF | `["sr","category","kra","kpi","uom","target","weightage","criteria","r5","r4","r3","r2","r1","r0","frequency","source"]` |
| `kra_export_show_logo` | `export` | Show company logo in export | `true` |
| `kra_export_show_employee_details` | `export` | Show employee profile header | `true` |

---

## Implementation Plan

### 1. Database: Seed `workflow_settings` rows

Insert 7 new rows into the `workflow_settings` table using the existing `export` category. This uses the migration tool for a data insert.

### 2. New File: `src/lib/kraExport.ts`

KRA-specific PDF generator. Reads the column configuration from settings to dynamically build the table columns. Key functions:

- `buildKraSheetDoc(data, config)` -- accepts a config object that controls which columns to render
- `generateKraSheetPdf(data, config)` -- triggers download
- `generateKraSheetPdfBlob(data, config)` -- returns blob for preview
- `buildKraSheetFromKpis(kpis, profile, period, year)` -- maps raw KPI data to the export data structure

The column list is **not hardcoded** in the PDF builder. Instead, it receives a `visibleColumns: string[]` array from the settings and dynamically constructs the table headers and row data from a column registry:

```text
const COLUMN_REGISTRY = {
  sr:        { header: 'Sr.', width: 8 },
  category:  { header: 'Category', width: 22 },
  kra:       { header: 'KRA', width: 30 },
  kpi:       { header: 'KPI', width: 30 },
  uom:       { header: 'UOM', width: 15 },
  target:    { header: 'Target', width: 18 },
  weightage: { header: 'Wt%', width: 10 },
  criteria:  { header: 'Criteria', width: 20 },
  r5:        { header: 'R5', width: 15 },
  r4:        { header: 'R4', width: 15 },
  r3:        { header: 'R3', width: 15 },
  r2:        { header: 'R2', width: 15 },
  r1:        { header: 'R1', width: 15 },
  r0:        { header: 'R0', width: 15 },
  frequency: { header: 'Freq.', width: 15 },
  source:    { header: 'Source', width: 20 },
};
```

Adding a new column in the future only requires adding one entry to this registry -- no other code changes needed.

### 3. New Hook: `src/hooks/useKraExportConfig.ts`

Reads the export settings from `workflow_settings` and exposes:

- `isEnabled` -- master toggle
- `canPreview(role)` -- checks role against allowed preview roles
- `canDownload(role)` -- checks role against allowed download roles
- `canEmail(role)` -- checks role against allowed email roles
- `visibleColumns` -- array of column keys for the PDF
- `showLogo`, `showEmployeeDetails` -- PDF layout flags

### 4. New Component: `src/components/review/KraExportMenu.tsx`

Dropdown button with Preview/Download/Email options. Each option is conditionally rendered based on the user's role and the settings from `useKraExportConfig`. If no actions are available for the user's role, the button is hidden entirely.

### 5. New Component: `src/components/review/KraPreviewDialog.tsx`

Full-screen responsive dialog (Drawer on mobile, Dialog on desktop) with an embedded PDF viewer via `<iframe>` and a download button.

### 6. Update: `src/pages/Dashboard.tsx`

Add `KraExportMenu` to the KPI detail section header. Pass `periodFilteredKpis`, `profile`, `selectedPeriod`, `selectedYear`.

### 7. Update: `src/components/review/UnifiedScorecard.tsx`

Add `KraExportMenu` to the reviewer scorecard header for managers/auditors reviewing an employee.

### 8. New Admin UI: Export Settings Section in `WorkflowSettingsTab`

Add an "Export" category card in the existing Controls tab (System Settings > Controls). This card renders:

- Master toggle: Enable/Disable KRA Export
- Role checkboxes for Preview, Download, Email (using the same `ALL_APP_ROLES` array -- automatically picks up new roles)
- Column visibility checklist with drag-to-reorder (future enhancement) or simple checkboxes
- Logo and employee details toggles

This follows the exact same pattern as the existing `SettingInput` component but with a custom renderer for the role-array and column-array settings.

### 9. Update: `DOCUMENTATION.md`

Document the new feature, its admin controls, and the column registry pattern.

---

## Technical Details

### PDF Layout

Landscape A4. Columns are dynamically rendered based on admin config. If admin disables rating scale columns (R0-R5), the remaining columns get more space automatically.

```text
+------------------------------------------------------------------+
|  [Logo*]  KRA Assignment Sheet         Period: January 2026       |
|------------------------------------------------------------------|
|  Employee*: John Doe (EMP001)   Dept: HR   Desig: Manager         |
|------------------------------------------------------------------|
|  [Dynamic columns based on kra_export_columns setting]            |
|  Sr | Category | KRA | KPI | UOM | Target | Wt% | R5 | R4 | ...  |
|------------------------------------------------------------------|
|  Summary: Total Weightage, Total KPIs, Issuance Status            |
+------------------------------------------------------------------+
* = controlled by admin toggles
```

### Data Flow

1. Dashboard/UnifiedScorecard already has KPIs and profile in memory
2. `useKraExportConfig` fetches settings once (cached 5 min)
3. On click, `KraExportMenu` calls `buildKraSheetFromKpis()` with the visible columns config
4. PDF is generated client-side -- no new API calls needed

### Future Extensibility

- **New column**: Add one entry to `COLUMN_REGISTRY` in `kraExport.ts` and one migration to append it to the default `kra_export_columns` setting
- **New role**: Already handled -- `ALL_APP_ROLES` from `src/lib/roles.ts` is the single source of truth
- **Email integration**: The Email button is role-gated from day one; the actual send logic can be wired to the existing email edge function later
- **User-level overrides**: Can follow the same `report_access_user_overrides` pattern if needed in the future

---

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|------------|
| Data | None | No new tables; uses existing `workflow_settings` with new rows |
| Regression | Low | New files only; existing pages get one additional button |
| Security | None | PDF contains only data the user can already see on screen |
| Performance | Low | Client-side PDF generation; column config cached |
| Workflow | None | No business logic changes |

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `workflow_settings` (DB) | Insert rows | 7 new config rows for the `export` category |
| `src/lib/kraExport.ts` | Create | Dynamic column-registry PDF generator |
| `src/hooks/useKraExportConfig.ts` | Create | Hook to read export settings and check role permissions |
| `src/components/review/KraExportMenu.tsx` | Create | Dropdown with role-gated Preview/Download/Email |
| `src/components/review/KraPreviewDialog.tsx` | Create | Responsive PDF preview dialog |
| `src/pages/Dashboard.tsx` | Edit | Add KraExportMenu to KPI detail header |
| `src/components/review/UnifiedScorecard.tsx` | Edit | Add KraExportMenu to reviewer header |
| `src/components/admin/WorkflowSettingsTab.tsx` | Edit | Add Export category card with role/column controls |
| `DOCUMENTATION.md` | Edit | Document the feature and admin controls |

