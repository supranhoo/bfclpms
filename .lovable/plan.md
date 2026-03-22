

## Replace Manager/Skip-Manager Columns with "Pending With" on All Pending Tabs

### Problem
The current table shows "Manager" and "Skip-Level Manager" name columns, which is confusing — users need to know **which workflow level** the KPI is pending at, not just names. Also, KRA and Days Overdue columns waste space.

### Changes

#### File: `src/pages/admin/PendingSelfReviews.tsx`

**All three pending tabs** (Pending Self-Review, Pending Manager Review, Pending Skip-Level Review):

1. **Remove columns**: `KRA` and `Days Overdue` (both header and body cells)
2. **Replace** the two columns `Manager` + `Skip-Level Manager` with a single column `Pending With`
3. The "Pending With" value is derived from the tab context:
   - **Pending Self-Review tab**: Display `"Employee"` (the employee themselves)
   - **Pending Manager Review tab**: Display `"Manager"` 
   - **Pending Skip-Level Review tab**: Display `"Skip-Level Manager"`

This is a static label per tab since all KPIs in a given tab are pending at the same level by definition.

### Result
Each tab's table will have columns: `☐ | Employee | Code | Department | KPI | Pending With | Period` — cleaner, more informative, and less wide.

