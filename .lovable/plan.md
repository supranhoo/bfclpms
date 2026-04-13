

## Fix: Copied Org KPIs Not Shown as Org KPIs + Data Owner Not Applied

### Root Cause Analysis

**Issue 1: Org KPI not appearing in Org KPI Data Entry page**
The `CopyKrasDialog` correctly copies `is_org_level: true` and `org_level_scope` to the new KPI record. However, after copy it only invalidates `['all-kpis']` and `['kpis']` query caches — it does NOT invalidate `['org-level-kpis']`, `['org-level-kpis-with-employees']`, or `['org-kpi-full-mapping']`. This means the Org KPI Data Entry page still shows stale data and the new employee doesn't appear in the org KPI employee list.

**Issue 2: Data owner not visible for new employee**
The `org_kpi_data_owners` table is keyed by `category_id + kra_name + kpi_name` (not employee-specific), so data owners technically still apply. However, the `['org-kpi-data-owners']` and `['org-kpi-data-owner-names']` query caches are also not invalidated, so the UI may not re-fetch and display the data owner badges for the newly copied KPIs.

**Issue 3: Missing `org_kpi_values` row for employee-scoped KPIs**
When an org KPI has `org_level_scope = 'employee'`, the data entry page expects an `org_kpi_values` row per employee. The copy dialog doesn't create these rows, so the data owner has no entry row to fill for the new employee.

### Fix

**File: `src/components/admin/CopyKrasDialog.tsx`**

1. **Invalidate org KPI query caches** in the `onSuccess` handler (lines 234-237):
   - Add `['org-level-kpis']`
   - Add `['org-level-kpis-with-employees']`
   - Add `['org-kpi-full-mapping']`
   - Add `['org-kpi-data-owners']`
   - Add `['org-kpi-data-owner-names']`
   - Add `['org-kpi-values']`

2. **Create `org_kpi_values` placeholder rows** for employee-scoped org KPIs after insert (in the mutation function, after the bulk insert succeeds):
   - For each copied KPI where `is_org_level = true` and `org_level_scope = 'employee'`, insert a placeholder row into `org_kpi_values` with `employee_id` set to the target employee, matching `category_id`, `kra_name`, `kpi_name`, `review_period`, `review_year`, and status `'entered'`.
   - Copy `target_value`, `criteria`, `uom_type`, `qualitative_options`, and rating thresholds (`r0`–`r5`) from the source KPI so the data entry card renders correctly.

**File: `DOCUMENTATION.md`** — Version bump, changelog.

**File: `POLICY.md`** — Note: Copy KRA must preserve org KPI data entry infrastructure.

### Risk Assessment
- **Data impact**: New rows in `org_kpi_values` (placeholder only, no achieved values) — safe
- **Regression risk**: Low — only adds cache invalidation and optional inserts for org KPIs
- **Fix confidence**: High — matches existing patterns in `useAddEmployeesToOrgKpi`

