
## Add "Edit Scope" to Org KPI Data Entry Card

### What changes

An **Edit Scope** button will be added to the footer action row of each Org KPI card on the Data Entry page, positioned between "Impact" and "Data Owners". Clicking it opens a scope selector (Organization / Department / Employee), which then launches the existing `OrgKpiScopeChangeDialog` with cascade preview support.

### UI Layout (footer row)

```text
[History] [Impact] [Edit Scope] [Data Owners] [Remove]          [Propagate]
```

- **Edit Scope** — visible only to admins, only when the KPI is **not** propagated (same guard as Data Owners).
- Clicking opens a small dropdown/popover with three scope options: Organization, Department, Employee.
- The current scope is indicated (disabled or checked).
- Selecting a different scope opens `OrgKpiScopeChangeDialog` for confirmation and optional forward-cascade.

### Technical Details

**File: `src/components/admin/OrgKpiEntryCard.tsx`**
1. Import `OrgKpiScopeChangeDialog` and `Settings2` (or `SlidersHorizontal`) icon from lucide.
2. Add state: `scopeChangeTarget` (null or the new scope value).
3. Add a `DropdownMenu` button labeled "Edit Scope" with three items (Organization, Department, Employee). Current scope item is disabled.
4. On item click, set `scopeChangeTarget` to the selected value.
5. Render `OrgKpiScopeChangeDialog` at the bottom of the component (beside existing `OrgKpiOwnerDialog`), passing `data.categoryId`, `data.kraName`, `data.kpiName`, `reviewPeriod`, `reviewYear`, `data.scope` as current, and `scopeChangeTarget` as new scope.
6. On dialog close, reset `scopeChangeTarget` to null.

No database changes required — this reuses the existing `change_org_kpi_scope_cascading` RPC via `useChangeOrgKpiScope`.
