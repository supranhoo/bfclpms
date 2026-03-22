

## Add "Reviewer Name" Column to Pending Review Tabs

### Changes

#### File: `src/pages/admin/PendingSelfReviews.tsx`

For all three pending tabs (Self-Review, Manager Review, Skip-Level Review):

1. **Add a `Reviewer` column header** after the existing `Pending With` column
2. **Add a `Reviewer` cell** showing the person's name based on tab:
   - **Self-Review tab**: Show `item.reportingManagerName || "-"` (the manager who will review next)
   - **Manager Review tab**: Show `item.reportingManagerName || "-"`
   - **Skip-Level Review tab**: Show `item.skipLevelManagerName || "-"`

Since "Pending With" already shows the level (Employee/Manager/Skip-Level Manager), and for Auditor/Management there is no specific person, the reviewer name defaults to `"-"` in those cases. The data already has `reportingManagerName` and `skipLevelManagerName` fields on each `OverdueKpi` item — no hook changes needed.

3. **Update the Excel export** (`handleExportExcel`) to include a `Reviewer` column with the same logic.

Final columns: `☐ | Employee | Code | Department | KPI | Pending With | Reviewer | Period`

### No database changes needed

