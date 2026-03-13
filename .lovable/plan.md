

# Add Admin Action Buttons to "View KPI Details"

## What
Add two buttons — "Admin KPI Editor" and "Admin Data Entry" — to the KPI header section inside the "View KPI Details" panel. Visible only to admin users. These buttons open the existing `AdminKpiEditDialog` and `AdminDataEntryDialog` respectively.

## Where
The buttons will be added to **`KpiHeaderSection`**, which is rendered by `KpiReviewPanel`, which is used across all 6 scorecards (SelfReviewSheet, EmployeeScorecard, AuditScorecard, ManagementScorecard, UnifiedScorecard, MentionedKpiSheet). This ensures coverage across all levels and dashboards with a single change point.

## How

### 1. `KpiReviewPanel.tsx`
- Pass `kpi.employee_id` context down to `KpiHeaderSection` so it can open the data entry dialog with the correct employee.

### 2. `KpiHeaderSection.tsx`
- Import `useAuth` and check `role === 'admin'`.
- Import `AdminKpiEditDialog` and `AdminDataEntryDialog`.
- Add local state for opening each dialog.
- Fetch employee name/code from the existing `profiles` query (already fetches `reporting_manager_id`, extend to include `full_name` and `employee_code`).
- Render two small buttons (Settings icon for Editor, ClipboardEdit icon for Data Entry) in the header badges row, only when admin.
- Render the two dialog components conditionally.

### Files Modified
1. **`src/components/review/KpiReviewPanel.tsx`** — Pass employee context to header
2. **`src/components/review/KpiHeaderSection.tsx`** — Add admin buttons + dialogs

