

## RCA: "Cannot propagate blank data" Error for Employee-Scoped Org KPIs

### Root Cause

In `src/pages/admin/OrgKpiDataEntry.tsx` line 547, the blank-data guard is:

```typescript
if (!values.isNa && values.achievedValue === null) {
  toast({ title: 'Cannot propagate blank data', ... });
  return;
}
```

This checks the **top-level** `values.achievedValue`, which is always `null` for employee-scoped and department-scoped KPIs. The actual data lives in `values.scopedValues`. The guard fires before the code ever reaches the scoped propagation loop at line 572, blocking all propagation for scoped KPIs — even when every row has data entered.

This is the same class of bug as the Propagate button disabled issue (v2.13.8) — the code assumes org-scope data shape for all scopes.

### Fix

**File: `src/pages/admin/OrgKpiDataEntry.tsx` (line 546-554)**

Replace the flat blank-data guard with scope-aware logic:

```text
IF scope === 'organization':
  Block if !values.isNa && values.achievedValue === null
ELSE (department/employee):
  Block if !values.isNa && (!values.scopedValues || 
    !values.scopedValues.some(sv => sv.achievedValue !== null || sv.isNa))
```

This allows propagation when at least one scoped row has data, matching the approved "only edited rows" propagation rule (the existing `continue` guard at line 574 already skips blank rows).

**File: `DOCUMENTATION.md`** — Version history v2.13.9

**File: `POLICY.md`** — Add to §29: "The blank-data propagation guard must also be scope-aware."

### Files Changed
| File | Change |
|------|--------|
| `src/pages/admin/OrgKpiDataEntry.tsx` | Make blank-data guard scope-aware (lines 546-554) |
| `DOCUMENTATION.md` | Version history v2.13.9 |
| `POLICY.md` | Extend §29 scope-aware invariant |

### Risk Assessment
- **Regression**: Zero — only relaxes guard for scoped KPIs that have data in scopedValues
- **Scope**: Propagation guard only; propagation logic unchanged
- **Safety net**: Line 574 already skips individual blank rows during scoped propagation

