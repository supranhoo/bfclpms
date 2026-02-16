

# Add Excel Export for All Observations

## Overview

Add a "Download Report" button to the Observations Overview page that exports the currently filtered observations to an Excel file using the existing `xlsx` library.

## Changes

### File: `src/pages/admin/ObservationsOverview.tsx`

1. **Import** `Button` from `@/components/ui/button`, `Download` from `lucide-react`, and `* as XLSX from 'xlsx'`
2. **Add an export function** `handleExportExcel` that maps the current `filtered` array to Excel rows with columns:
   - Ticket #
   - Title
   - Description
   - Employee Name
   - Employee Code
   - KRA
   - KPI
   - Type (Positive/Concern/Neutral)
   - Observer Name
   - Observer Role
   - Status
   - Date Created
   - Date Updated
3. **Add the Download button** next to the search bar in the filters section, using the same style as other export buttons (`variant="outline" size="sm"`)
4. The export respects the current filters (status tab + search), so admins can export a subset
5. File name: `Observations_Report_YYYY-MM-DD.xlsx`

### File: `DOCUMENTATION.md`

Update to mention the observation export capability.

## Technical Detail

The export function follows the same pattern as `OrgKpiBulkExport`:

```typescript
const handleExportExcel = () => {
  const rows = filtered.map(obs => ({
    'Ticket #': (obs as any).ticket_number || '',
    'Title': obs.title,
    'Description': obs.description || '',
    'Employee': obs.employee_profile?.full_name || '',
    'Employee Code': obs.employee_profile?.employee_code || '',
    'KRA': obs.kpi?.kra_name || '',
    'KPI': obs.kpi?.kpi_name || '',
    'Type': typeConfig[obs.observation_type]?.label || obs.observation_type,
    'Observer': obs.created_by_profile?.full_name || '',
    'Observer Role': obs.observer_role,
    'Status': statusConfig[obs.status]?.label || obs.status,
    'Created': format(new Date(obs.created_at), 'dd MMM yyyy'),
    'Last Updated': format(new Date(obs.updated_at), 'dd MMM yyyy'),
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 12 }, { wch: 30 }, { wch: 40 }, { wch: 20 }, { wch: 14 },
    { wch: 25 }, { wch: 30 }, { wch: 10 }, { wch: 20 }, { wch: 14 },
    { wch: 14 }, { wch: 14 }, { wch: 14 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Observations');
  XLSX.writeFile(wb, `Observations_Report_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
};
```

No database changes are needed.
