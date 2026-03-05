

# Add Excel Export to KRA Export Menu with Role-Based Access

## Changes

### 1. `src/hooks/useKraExportConfig.ts`
- Add `excelRoles: string[]` to `KraExportConfig` interface
- Parse `kra_export_excel_roles` from workflow_settings

### 2. `src/lib/kraExport.ts`
- Add `generateKraSheetExcel(data: KraSheetData, config: KraExportConfig): void` function
- Uses `xlsx` library (already installed) to produce an `.xlsx` file with the same dynamic columns from `COLUMN_REGISTRY` based on `visibleColumns`
- Includes employee details header rows (if `showEmployeeDetails` is true) and the KPI data table with proper column widths

### 3. `src/components/review/KraExportMenu.tsx`
- Import `FileSpreadsheet` icon from lucide-react
- Add `canExcel = canAccess(exportConfig.excelRoles, effectiveRole)` check
- Add "Download Excel" menu item gated by `canExcel`
- Call `generateKraSheetExcel` on click
- Update visibility check to include `canExcel`

### 4. `src/components/admin/WorkflowSettingsTab.tsx`
- No code changes needed — the existing `setting_key.endsWith('_roles')` pattern automatically renders the role-checkbox UI for `kra_export_excel_roles`

### 5. Database: Insert new workflow_setting row
- Insert `kra_export_excel_roles` into `workflow_settings` (category: `export`) with default value of `["admin"]` so admins can immediately configure which roles get Excel access

## Risk Assessment
- **No schema changes** — just one new settings row
- **xlsx already installed** — no new dependency
- **Existing pattern** — follows the exact same role-gating approach as Preview/Download/Email

