

# Org KPI Data Entry Overhaul - Full Implementation Plan (Phases 1-5)

## Current State

The existing data entry page (`/admin/org-kpi-data`) is a single flat table with 11 columns showing every Org KPI in one scrollable list. There is 1 data owner assigned and only 1 value entered. The system supports ownership filtering, evidence upload, impact analysis, and propagation -- but the UI makes it hard for a non-admin data entry person to use efficiently.

---

## Phase 1: Card-Based Data Entry UI + Progress Tracking

### Before

```text
+-----------------------------------------------------------------------+
| Filters: Period | Category | Dept | Designation | KRA | Search        |
+-----------------------------------------------------------------------+
| Table Header: Category | KRA | KPI | Employee | Dept | Desig |       |
|                Achieved | Remark | File | Impact | Actions            |
+-----------------------------------------------------------------------+
| Row 1: Compliance | Statutory | ... | All Employees | -- | -- | ___  |
| Row 2: Compliance | Closure   | ... | All Employees | -- | -- | ___  |
| Row 3: Safety     | Fire      | ... | All Employees | -- | -- | ___  |
| ... (flat list of all rows, no grouping, no progress)                 |
+-----------------------------------------------------------------------+
| [Save All]                                                            |
+-----------------------------------------------------------------------+
```

### After

```text
+-----------------------------------------------------------------------+
| Organization KPI Data Entry                                           |
| Period: [February 2026]  Year: [2026]                                 |
| Category: [All] [Compliance] [Safety] [Quality] ...   [Search: ___]  |
+-----------------------------------------------------------------------+
| Progress: [===========---------] 15/43 KPIs Entered                  |
+-----------------------------------------------------------------------+
|                                                                       |
| -- Compliance (5 KPIs) -- 2/5 entered ------------------------------ |
|                                                                       |
| +--- Annual Medical Examination --------------------------------+    |
| | KRA: Statutory Compliance                                      |    |
| | Target: 0  |  UOM: Number  |  Scope: Organization             |    |
| |                                                                |    |
| | Achieved: [______]   Remark: [______________]   [Upload File]  |    |
| | Previous Period: -- (no data)                                  |    |
| |                                                    Status: Pending  |
| | [Save]  [Save & Propagate]                                     |    |
| +----------------------------------------------------------------+    |
|                                                                       |
| +--- Closure of Audit Points -----------------------------------+    |
| | KRA: Audit Compliance                                          |    |
| | Target: 0  |  UOM: Number  |  Scope: Organization             |    |
| |                                                                |    |
| | Achieved: [__0__]   Remark: [All closed]   [View File]         |    |
| | Previous Period: 0 (Jan 2026)                                  |    |
| |                                                    Status: Entered  |
| | [Save]  [Save & Propagate]                                     |    |
| +----------------------------------------------------------------+    |
|                                                                       |
| -- Safety (8 KPIs) -- 5/8 entered ------------------------------- -- |
| ...                                                                   |
|                                                                       |
| +--- OEE (Department-scoped) -----------------------------------+    |
| | KRA: Production Efficiency                                     |    |
| | Target: 85%  |  UOM: %  |  Scope: Department                  |    |
| |                                                                |    |
| | [v Expand 6 departments]                                       |    |
| |  +--------------------------------------------------+         |    |
| |  | Department    | Achieved | Remark        | File  |         |    |
| |  | Production    | [90___]  | [Good______]  | [Up]  |         |    |
| |  | Maintenance   | [80___]  | [__________]  | [Up]  |         |    |
| |  | Quality       | [______] | [__________]  | [Up]  |         |    |
| |  +--------------------------------------------------+         |    |
| |                                                                |    |
| | [Save All Departments]  [Save & Propagate All]                 |    |
| +----------------------------------------------------------------+    |
+-----------------------------------------------------------------------+
```

### Changes

| File | Action | Details |
|---|---|---|
| `src/components/admin/OrgKpiEntryCard.tsx` | CREATE | Single KPI card with inline inputs, save/propagate buttons, previous period value |
| `src/components/admin/OrgKpiProgressBar.tsx` | CREATE | Progress bar showing X/Y KPIs entered, per-category mini-progress |
| `src/components/admin/OrgKpiScopedEntryTable.tsx` | CREATE | Collapsible mini-table for department/employee-scoped KPIs inside a card |
| `src/pages/admin/OrgKpiDataEntry.tsx` | REWRITE | Replace flat table with card layout grouped by category, category pill tabs, simplified filters |
| `src/hooks/useOrgKpiValues.ts` | ADD | New hook `useOrgKpiPreviousPeriodValues` to fetch last period's data for reference |
| `DOCUMENTATION.md` | UPDATE | Document new card-based UI |

### Technical Details

- Each `OrgKpiEntryCard` manages its own local state (dirty tracking per card)
- Individual "Save" calls existing `useBulkUpsertOrgKpiValues` with just that card's data
- "Save & Propagate" calls upsert then `usePropagateOrgKpiValue` sequentially
- Progress = count of `org_kpi_values` with non-null `achieved_value` / total unique org KPIs
- Category tabs use existing `kra_categories` data with color dots
- For department-scoped KPIs, `OrgKpiScopedEntryTable` renders a compact table inside the card with collapsible expand
- Ownership filtering stays the same (non-admins only see their assigned KPIs)
- No database changes required

---

## Phase 2: Copy from Last Period + Auto-Save

### Before (Phase 1 state)

- User must manually enter every value each period
- No save indicator -- user clicks "Save" and waits

### After

```text
+-----------------------------------------------------------------------+
| [Copy from Last Period]  [Import Excel]  [Export Template]             |
+-----------------------------------------------------------------------+
|                                                                       |
| +--- Annual Medical Examination --------------------------------+    |
| | ...                                                            |    |
| | Achieved: [__0__]  (Copied from Jan 2026)     Saved 2s ago    |    |
| +----------------------------------------------------------------+    |
```

### Changes

| File | Action | Details |
|---|---|---|
| `src/pages/admin/OrgKpiDataEntry.tsx` | ADD | "Copy from Last Period" button in header |
| `src/components/admin/OrgKpiEntryCard.tsx` | ADD | Auto-save with 2s debounce, "Saving..." / "Saved" indicator |
| `src/hooks/useOrgKpiValues.ts` | ADD | `useCopyFromPreviousPeriod` mutation that bulk-copies values |

### Technical Details

- "Copy from Last Period" fetches previous period's `org_kpi_values` and pre-fills current period cards
- Only copies where current value is null (does not overwrite existing entries)
- Auto-save uses `useRef` + `setTimeout` debounce (2000ms after last keystroke)
- Save indicator shows "Saving...", then "Saved" with checkmark for 3s
- `beforeunload` handler warns if any cards have unsaved edits
- No database changes required

---

## Phase 3: Bulk Excel Import/Export

### Before

- No way to enter data offline or in bulk

### After

```text
+--- Import from Excel -------------------------------------------+
| Step 1: Download template with KPI names + targets pre-filled    |
| Step 2: Fill "Achieved" and "Remark" columns in Excel            |
| Step 3: Upload and validate                                      |
|                                                                  |
| Preview:                                                         |
| +------------------------------------------------------+        |
| | KPI Name         | Target | Achieved | Status        |        |
| | Medical Exam     | 0      | 0        | Valid         |        |
| | Audit Closure    | 0      | 2        | Valid         |        |
| | Fire Safety      | 100%   | abc      | Invalid Value |        |
| +------------------------------------------------------+        |
|                                                                  |
| [Import 2 Valid KPIs]  [Cancel]                                  |
+------------------------------------------------------------------+
```

### Changes

| File | Action | Details |
|---|---|---|
| `src/components/admin/OrgKpiBulkImport.tsx` | CREATE | Dialog with upload, validation preview, and import button |
| `src/components/admin/OrgKpiBulkExport.tsx` | CREATE | Button that generates Excel template with KPI names, targets, UOM pre-filled |
| `src/pages/admin/OrgKpiDataEntry.tsx` | ADD | Import/Export buttons in header area |
| `DOCUMENTATION.md` | UPDATE | Document bulk import/export |

### Technical Details

- Uses existing `xlsx` library (already installed)
- Template columns: Category, KRA, KPI Name, Target, UOM, Achieved Value (blank), Remark (blank)
- Validation: match by category+KRA+KPI name exactly, check numeric for numeric UOM types
- Preview table shows green/red status per row
- Import calls existing `useBulkUpsertOrgKpiValues`
- No database changes required

---

## Phase 4: Audit Trail for Data Entry

### Before

- No record of who entered what value or when it changed

### After

- Every save (manual, auto-save, import, copy) creates a log entry
- "View History" button on each card shows a timeline of changes

```text
+--- Value History: Annual Medical Examination --------------------+
| Feb 16, 2026 14:30  |  Jaspal Singh  |  Set to 0  |  Manual     |
| Feb 16, 2026 14:25  |  Jaspal Singh  |  Copied from Jan 2026    |
| Jan 31, 2026 17:00  |  Admin         |  Set to 0  |  Manual     |
+------------------------------------------------------------------+
```

### Changes

| File | Action | Details |
|---|---|---|
| Database migration | CREATE TABLE | `org_kpi_data_entry_logs` with columns: id, org_kpi_value_id, category_id, kra_name, kpi_name, review_period, review_year, action, performed_by, old_value, new_value, remarks, created_at |
| `src/hooks/useOrgKpiAuditLog.ts` | CREATE | Hook to fetch and insert audit log entries |
| `src/components/admin/OrgKpiAuditLog.tsx` | CREATE | Timeline component showing change history per KPI |
| `src/components/admin/OrgKpiEntryCard.tsx` | ADD | "View History" button that opens audit log popover |
| `src/hooks/useOrgKpiValues.ts` | ADD | Insert audit log entry on every save |
| `DOCUMENTATION.md` | UPDATE | Document audit trail |

### Database Migration

```sql
CREATE TABLE org_kpi_data_entry_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_kpi_value_id UUID REFERENCES org_kpi_values(id) ON DELETE SET NULL,
  category_id UUID NOT NULL,
  kra_name TEXT NOT NULL,
  kpi_name TEXT NOT NULL,
  review_period TEXT NOT NULL,
  review_year INTEGER NOT NULL,
  action TEXT NOT NULL,
  performed_by UUID REFERENCES auth.users(id),
  old_value NUMERIC,
  new_value NUMERIC,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE org_kpi_data_entry_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and data owners can view audit logs"
  ON org_kpi_data_entry_logs FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR performed_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM org_kpi_data_owners
      WHERE owner_id = auth.uid()
        AND category_id = org_kpi_data_entry_logs.category_id
        AND kra_name = org_kpi_data_entry_logs.kra_name
        AND kpi_name = org_kpi_data_entry_logs.kpi_name
    )
  );

CREATE POLICY "Authenticated users can insert audit logs"
  ON org_kpi_data_entry_logs FOR INSERT
  WITH CHECK (auth.uid() = performed_by);
```

---

## Phase 5: Enhanced Data Owner Management

### Before

- Owner assignment is per-KPI only (must assign one at a time via the per-row button)
- No overview of all assignments

### After

```text
+--- Data Owner Management ----------------------------------------+
|                                                                   |
| Category: Compliance (5 KPIs)                                     |
| +---------------------------------------------------------------+|
| | Owner: Jaspal Singh  |  Assigned to: 3/5 KPIs  |  [Manage]   ||
| | Owner: --            |  2 KPIs unassigned        |  [Assign]  ||
| +---------------------------------------------------------------+|
|                                                                   |
| [Assign Jaspal to ALL 5 KPIs in Compliance]                      |
|                                                                   |
| Category: Safety (8 KPIs)                                         |
| +---------------------------------------------------------------+|
| | No owners assigned   |  [Bulk Assign]                          ||
| +---------------------------------------------------------------+|
+-------------------------------------------------------------------+
```

### Changes

| File | Action | Details |
|---|---|---|
| `src/components/admin/OrgKpiOwnerDialog.tsx` | ENHANCE | Add "Assign to all KPIs in this category" checkbox/button |
| `src/components/admin/OrgKpiOwnerManagement.tsx` | CREATE | Full admin panel showing all categories with owner counts, bulk assign/remove |
| `src/hooks/useOrgKpiDataOwner.ts` | ADD | `useBulkAssignOrgKpiOwner` mutation that inserts owner for all KPIs in a category |
| `src/pages/admin/OrgKpiDataEntry.tsx` | ADD | Link/tab to owner management panel (admin only) |
| `DOCUMENTATION.md` | UPDATE | Document bulk owner assignment |

### Technical Details

- Bulk assign finds all unique KPI definitions in a category and inserts `org_kpi_data_owners` rows for each
- Uses existing `org_kpi_data_owners` table -- no new tables needed
- Owner management panel groups by category, shows assigned count vs total
- No database changes required (uses existing table)

---

## Implementation Order and Dependencies

```text
Phase 1 (Card UI + Progress)
    |
    v
Phase 2 (Copy + Auto-save)  -- depends on Phase 1 card components
    |
    v
Phase 3 (Excel Import/Export)  -- independent, uses same save hooks
    |
Phase 4 (Audit Trail)  -- independent, adds logging to save hooks
    |
Phase 5 (Owner Management)  -- independent, enhances existing dialog
```

Phases 1 and 2 should be done together. Phases 3, 4, 5 are independent and can be done in any order after Phase 2.

## What Is NOT Included (and Why)

| Skipped Feature | Reason |
|---|---|
| New `org_kpi_data_entry` role | Existing `org_kpi_data_owners` + `DataOwnerRoute` already handles access control. Adding a new role would require RLS changes across dozens of tables. |
| Approval workflow (draft/pending/approved) | The `org_kpi_values` table already has status + send-back workflow. Adding another layer would conflict with propagation flow. |
| Auto-notification reminders | Requires CRON edge function infrastructure. Better as a separate future initiative. |
| Data entry templates | With "Copy from Last Period" covering 90% of use cases, templates add complexity with little benefit for 43 KPIs. |

