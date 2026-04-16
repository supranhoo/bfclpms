

## Custom Report Builder + Report Customization Engine

### What This Is
A **"Report Builder"** section in System Settings that lets admins:
1. **Create new custom reports** by selecting fields from system data sources
2. **Reorder ALL reports** (pre-built + custom) on the Reports Hub via drag-and-drop
3. **Customize pre-built report columns** — add/remove fields from existing reports like Employee Summary, Performance Report, etc.

### Features

**A. Report Sequencing (Pre-built + Custom)**
- Drag-and-drop reorder of ALL report cards in Reports Hub
- Persisted as `report_display_order` in `system_settings` (JSON array of report keys)
- Pre-built reports retain their `reportKey`; custom reports use `custom_{id}`
- Reports not in the order array appear at the end in default order

**B. Pre-built Report Field Customization**
- Each pre-built report gets a "Customize Columns" action in the Report Builder tab
- Admins see the full list of available columns for that report (checked = visible)
- Drag-and-drop to reorder visible columns
- Column aliases (rename headers)
- Saved per-report as `report_columns_{reportKey}` in `system_settings`
- Reports read column config from settings; fall back to hardcoded defaults if no override exists

**C. Custom Report Creation** (as previously proposed)
- Report name, description, icon, color, category
- Field picker from data sources (Employee, Org, KPI, Scores, Workflow, etc.)
- Drag-and-drop column ordering with aliases
- Filter configuration (hardcoded vs user-selectable at runtime)
- Default sort & grouping
- Role-based access control
- Export options (Excel/PDF)

### Database Changes

**New table: `custom_reports`**
- id, name, description, icon, color, category
- columns (JSONB — ordered array of `{source, field, alias, width}`)
- filters (JSONB — `{field, operator, value, user_selectable}`)
- default_sort, group_by, export_excel, export_pdf, filename_template
- view_roles (text[]), is_active, created_by, timestamps

**New `system_settings` rows:**
- `report_display_order` — JSON array of report keys controlling hub card sequence
- `report_columns_{reportKey}` — per-report column override for each pre-built report

### New/Modified Files

| File | Change |
|------|--------|
| `src/components/admin/ReportBuilderTab.tsx` | New — main settings UI with 3 sections: Sequence, Pre-built Customization, Custom Reports CRUD |
| `src/components/admin/ReportSequenceConfig.tsx` | New — drag-and-drop list of all reports for ordering |
| `src/components/admin/ReportFieldPicker.tsx` | New — grouped checkbox + drag reorder for field selection |
| `src/components/admin/ReportFilterConfig.tsx` | New — filter rule builder for custom reports |
| `src/hooks/useCustomReports.ts` | New — CRUD hook for `custom_reports` table |
| `src/hooks/useReportColumnOverrides.ts` | New — reads per-report column config from settings |
| `src/lib/reportFieldRegistry.ts` | New — field definitions registry (source, key, label, type) |
| `src/pages/reports/CustomReport.tsx` | New — dynamic renderer for custom reports |
| `src/pages/reports/ReportsHub.tsx` | Modified — fetch display order + append custom reports |
| `src/pages/admin/SystemSettings.tsx` | Modified — add Report Builder section |
| Pre-built report pages (6-8 files) | Modified — read column overrides via hook, conditionally show/hide/reorder columns |
| `DOCUMENTATION.md`, `POLICY.md` | Version bump |

### Risk Assessment
- **Data impact**: Additive — new table + new settings rows; no schema changes to existing tables
- **Regression risk**: Low — pre-built reports default to current behavior when no override exists
- **Security**: RLS on `custom_reports` (admin write, role-filtered read); existing RLS on source tables protects query results

