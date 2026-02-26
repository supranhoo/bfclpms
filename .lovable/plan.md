

# Fix: Make "Assign to Auditor" Button Fully Functional (v1.46.21)

## Problem Found

The UI and database table exist, but there is a **critical logic bug** preventing correct reassignment:

- The unique constraint is on `(kpi_id, auditor_id)` -- meaning one KPI can be assigned to **multiple** auditors simultaneously.
- The upsert uses `onConflict: 'kpi_id,auditor_id'`, so reassigning a KPI from Mayank to Ayush creates a **second row** instead of replacing the first.
- The intent is **one auditor per KPI**. The constraint should be on `kpi_id` alone.

## Changes Required

### 1. Database Migration

- Drop the existing unique constraint on `(kpi_id, auditor_id)`.
- Add a new unique constraint on `(kpi_id)` alone -- enforcing exactly one auditor per KPI.
- Clean up any duplicate rows first (keep most recent).

```sql
-- Remove duplicates keeping latest
DELETE FROM audit_kpi_level_assignments a
USING audit_kpi_level_assignments b
WHERE a.kpi_id = b.kpi_id
  AND a.created_at < b.created_at;

-- Drop old constraint, add new one
ALTER TABLE audit_kpi_level_assignments
  DROP CONSTRAINT audit_kpi_level_assignments_kpi_id_auditor_id_key;

ALTER TABLE audit_kpi_level_assignments
  ADD CONSTRAINT audit_kpi_level_assignments_kpi_id_key UNIQUE (kpi_id);
```

### 2. Update Hook: `src/hooks/useAuditKpiAssignments.ts`

- Change `useAssignKpiToAuditor` upsert to use `onConflict: 'kpi_id'` so reassigning replaces the previous auditor.

### 3. No UI Changes Needed

The `AuditKpiAssignPopover` component and `KpiDetailsTable` integration are already correct. The popover lists auditors, shows a checkmark for the current assignee, and supports removal. Once the database constraint and hook are fixed, everything will work end-to-end.

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|-----------|
| Data impact | Minimal | Table is currently empty; migration handles duplicates defensively |
| Regression | None | Only the constraint and one line in the hook change |
| Workflow impact | None | Informational badges only; no access restriction changes |

