

# Enable Remark Input for N/A Marked Rows in Org KPI Data Entry (v1.46.4)

## Problem

When an employee's KPI is marked as "N/A" in the Org KPI Data Entry scoped table, the Remark column displays static "Not Applicable" text, preventing the data owner from entering a justification. Per system policy, N/A marking requires a mandatory remark/reason.

## Solution

Replace the static "Not Applicable" text with a Remark textarea when N/A is toggled on, for both Employee and Department row types. The remark field will be marked as required with a visual indicator.

## Technical Changes

### File: `src/components/admin/OrgKpiScopedEntryTable.tsx`

**EmployeeRow (lines 276-277)**: Replace the static "Not Applicable" text with a Textarea that allows entering N/A justification:

```typescript
// Before:
<span className="text-xs text-muted-foreground italic">Not Applicable</span>

// After:
<Textarea
  value={row.remarks}
  onChange={(e) => onValueChange(row.scopeId, 'remarks', e.target.value)}
  placeholder="Reason for N/A (required)"
  className="text-sm resize-none min-h-0 border-orange-300"
  rows={2}
  required
/>
```

**DepartmentRow (lines 352-353)**: Same change for department-scoped rows.

No database or other file changes needed -- the `remarks` field already flows through the existing save/propagate pipeline.

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|-----------|
| Data impact | None | Remark column already exists and is saved |
| Regression | None | Only changes what renders inside the N/A branch |
| Policy alignment | Improved | Matches existing N/A justification requirement |

