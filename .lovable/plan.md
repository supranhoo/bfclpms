

## RCA: Propagate Button Disabled for Scoped Org KPIs After Unlock

### Root Cause

In `OrgKpiEntryCard.tsx` line 669, the Propagate button's disabled check is:

```typescript
disabled={isPropagating || (!isNa && achievedValue.trim() === '')}
```

This checks the **top-level** `achievedValue` state. For department-scoped and employee-scoped KPIs, the top-level `achievedValue` is always empty (`''`) because actual values live in `scopedValues` (per-department or per-employee rows). The `buildCardData` in `OrgKpiDataEntry.tsx` (line 327-328) looks up `existing` using `||null||null` key, which only finds org-scope rows. For employee/department scoped KPIs, this returns nothing, so `data.achievedValue` is `null` and `achievedValue` state is `''`.

**Result**: The Propagate button is permanently disabled for all scoped KPIs, regardless of whether scoped rows have values.

### CAPA

**Corrective -- File: `src/components/admin/OrgKpiEntryCard.tsx`** (line 669)

Replace the simple `achievedValue.trim() === ''` check with scope-aware logic:
- For `organization` scope: keep existing check (`achievedValue.trim() === ''`)
- For `department`/`employee` scope: check if at least one `scopedValues` row has a non-null `achievedValue` or is marked N/A

```typescript
const hasAnyValue = data.scope === 'organization'
  ? (isNa || achievedValue.trim() !== '')
  : (isNa || scopedValues.some(sv => sv.achievedValue !== null || sv.isNa));

// Then on the button:
disabled={isPropagating || !hasAnyValue}
```

**Preventive -- File: `POLICY.md`**

Add invariant: "The Propagate button must use scope-aware validation. For scoped KPIs, check scopedValues; for org-scope, check the top-level achievedValue."

### Files Changed
| File | Change |
|------|--------|
| `src/components/admin/OrgKpiEntryCard.tsx` | Fix Propagate button disabled check to be scope-aware |
| `DOCUMENTATION.md` | Version history v2.13.8 |
| `POLICY.md` | Add scope-aware propagation validation invariant |

### Risk Assessment
- **Regression**: Zero -- only relaxes the disabled check for scoped KPIs that have values
- **Scope**: Propagate button enablement only; propagation logic itself is unchanged
- **Edge cases**: The `handleCardSaveAndPropagate` in `OrgKpiDataEntry.tsx` already has its own blank-data guard (line 547), so even if the button is enabled with partial data, the handler correctly filters to only propagate rows with values

