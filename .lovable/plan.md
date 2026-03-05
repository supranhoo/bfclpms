

# Missing Org KPI Audit Trail in Review Timeline

## Problem

The Review Timeline (`KpiTimeline.tsx`) reads from `kpi_audit_logs`. However, neither the Org KPI data entry flow (`useOrgKpiValues.ts`) nor the propagation flow (`usePropagateOrgKpiValue.ts`) writes to `kpi_audit_logs`. This means when a Data Owner enters a value and propagates it to employee scorecards, **zero entries** appear in the employee's Review Timeline for that KPI.

The Org KPI data entry logs go to a separate `org_kpi_data_entry_logs` table, which the Review Timeline does not read.

## Fix

### 1. `src/hooks/usePropagateOrgKpiValue.ts` — Log to `kpi_audit_logs` after propagation

After the RPC call succeeds, insert one `kpi_audit_logs` entry **per affected employee KPI** with:
- `action`: `'ORG_KPI_PROPAGATED'`
- `performed_by`: current user ID
- `new_value`: `{ achieved_value, self_score, self_rating, source: 'org_kpi_data_owner' }`

This uses the existing `kpiRatings` array which already has each `kpi_id` and its computed values.

### 2. `src/components/dashboard/KpiTimeline.tsx` — Add action config for new events

Add to the `actionConfig` map:
- `'ORG_KPI_PROPAGATED'`: icon `Briefcase`, color `bg-teal-500`, label `"Org KPI Data Entered"`
- `'ORG_KPI_VALUE_UPDATED'`: icon `Edit`, color `bg-teal-500`, label `"Org KPI Value Updated"`

Also update `formatDetails` to display achieved value details from these entries.

### 3. `src/hooks/usePropagateOrgKpiValue.ts` — Both single and bulk hooks

Apply the same audit logging pattern in both `usePropagateOrgKpiValue` and `useBulkPropagateOrgKpiValues` mutation functions.

## Risk Assessment
- **Data Impact**: Additive only — inserts new rows into `kpi_audit_logs`. No schema changes needed (table already supports arbitrary action strings).
- **Regression Risk**: Very low. Audit logging is fire-and-forget; failures are caught silently to avoid blocking the main propagation workflow.
- **Workflow Impact**: None. Purely informational — adds visibility without changing any business logic.

