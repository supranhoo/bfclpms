

## Plan: Sent-Back Indicator + Individual Propagation for Org KPI Scoped Table

### Feature 1: Sent-Back Row Highlight

**Approach**: Amber left-border + Undo2 icon with tooltip showing reason, per employee row.

**Data source**: Query `kpi_queries` (type `send_back`) joined with `kpis` (matching org KPI by category_id + kra_name + kpi_name + review_period + review_year + employee_id) to get per-employee send-back status and reason.

**Implementation**:

| File | Change |
|------|--------|
| `src/hooks/useSentBackOrgKpiEmployees.ts` | New hook — accepts category_id, kra_name, kpi_name, review_period, review_year. Returns `Map<employeeId, { reason, senderName, date }>` by joining kpis → kpi_queries (type=send_back, latest per KPI) |
| `src/pages/admin/OrgKpiDataEntry.tsx` | Call the hook, pass sent-back map down to `OrgKpiEntryCard` → `OrgKpiScopedEntryTable` |
| `src/components/admin/OrgKpiScopedEntryTable.tsx` | Accept `sentBackMap` prop. In `EmployeeRow`: if employee is sent-back, add `border-l-2 border-amber-500 bg-amber-50/30 dark:bg-amber-950/20` to the row + Undo2 icon with Tooltip showing reason and sender |

**Visual**: Row gets amber left border + subtle background tint. Undo2 icon appears after the name badges with a tooltip: *"Sent back by {name}: {reason}"*

### Feature 2: Individual + Multi-Select Propagation

**Approach**: Checkboxes on each row + per-row propagate icon button + "Propagate Selected" bulk action.

**Implementation**:

| File | Change |
|------|--------|
| `src/components/admin/OrgKpiScopedEntryTable.tsx` | Add checkbox column (first column). Add per-row ArrowUpRight icon button in a new Actions column. Emit `onPropagateRow(scopeId)` and `onSelectionChange(selectedIds[])` callbacks. Add "select all" checkbox in header. |
| `src/components/admin/OrgKpiEntryCard.tsx` | Add "Propagate Selected (N)" button next to existing "Propagate" when selections exist. Wire `onPropagateRow` to call propagation for single employee (scope=employee, employeeId=scopeId). Wire selection state. |
| `src/pages/admin/OrgKpiDataEntry.tsx` | Extend `handleCardSaveAndPropagate` to accept optional `employeeIds` filter — when provided, propagate only those employees instead of all |
| `src/hooks/usePropagateOrgKpiValue.ts` | No changes needed — already supports `scope: 'employee'` with `employeeId` param |

### Feature 3: Sent-Back Warning on Bulk Propagation

**Approach**: When clicking "Propagate" or "Propagate Selected", if any selected employees have sent-back KPIs, show an amber warning in the confirmation dialog listing those employees. Admin can still proceed.

| File | Change |
|------|--------|
| `src/components/admin/OrgKpiEntryCard.tsx` | In the AlertDialog for propagation confirmation, check sentBackMap against selected/all employees. If matches found, render an amber warning section: "The following employees have KPIs that were sent back: [list]. Propagating will overwrite their current review data." |

### Other Files
| File | Change |
|------|--------|
| `DOCUMENTATION.md` | Version history v2.14.0 |
| `POLICY.md` | Add §30: Sent-back visibility invariant for Org KPI scoped tables; §31: Individual propagation must be available alongside bulk |

### Table Layout Change

```text
Current:  | Employee | Target | N/A | Achieved | Rating | Remark | File |
Proposed: | ☐ | Employee | Target | N/A | Achieved | Rating | Remark | File | Actions |
                                                                              ↑ per-row propagate btn
```

### Risk Assessment
- **Regression**: Low — additive UI changes; propagation logic already supports employee scope
- **Performance**: Sent-back hook adds one query per card; acceptable since it's admin-only page
- **False positives**: Sent-back detection uses latest `kpi_queries` record — if KPI was re-approved after send-back, we should filter by checking current KPI status is not `approved`

