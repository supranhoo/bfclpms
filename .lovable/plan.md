

## Add Admin-Controlled Toggle for Data Owner / Data Entered By Visibility

### Problem
The "Data Owner" and "Data entered by" badges on the KPI Details panel are currently always visible. The user wants an admin toggle to control whether non-admin users can see this information.

### Approach
Use the existing `workflow_settings` table (same pattern as `org_kpi_employee_self_entry`, `remarks_mandatory_*`, etc.) to add a new boolean setting.

### Changes

#### 1. `src/hooks/useWorkflowSettings.ts` — Add default value
Add to `DEFAULT_VALUES`:
```typescript
show_data_owner_to_employees: true,
```

#### 2. `src/components/review/KpiHeaderSection.tsx` — Conditionally show badges
- Import `useWorkflowSettingValue` 
- Read `show_data_owner_to_employees` setting
- If `false` and user is not admin, hide the "Data Owner" and "Data entered by" badges
- Admins always see them regardless of the setting

#### 3. `src/components/admin/WorkflowSettingsTab.tsx` — Add toggle in admin UI
- Add a new setting row under a relevant category (e.g., "Validation" or a new "Visibility" section)
- Label: "Show Data Owner info to employees"
- Description: "When enabled, employees can see Data Owner and Data Entered By on KPI details"

#### 4. Database migration — Seed the setting row
```sql
INSERT INTO workflow_settings (category, setting_key, setting_value, label, description)
VALUES ('validation', 'show_data_owner_to_employees', 'true', 
        'Show Data Owner to Employees', 
        'When enabled, employees can see Data Owner and Data Entered By badges on KPI details')
ON CONFLICT DO NOTHING;
```

### Files Modified
- `src/hooks/useWorkflowSettings.ts` — add default
- `src/components/review/KpiHeaderSection.tsx` — conditional visibility
- `src/components/admin/WorkflowSettingsTab.tsx` — add toggle control
- DB migration — seed setting row

