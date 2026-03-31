

## Plan: Show Employee Names in Incentive Dry Run Dialog

### Problem
The `IncentiveDryRunDialog` accepts an `employeeNames` prop (`Map<string, { name, code }>`) but `MonthlyIncentiveTable` never passes it. The dialog falls back to `r.employee_id.slice(0, 8)` — showing UUIDs like "935c69c8".

### Fix

**`src/components/incentive/MonthlyIncentiveTable.tsx`**:
1. After a successful dry run, extract all `employee_id` values from the result records
2. Fetch profiles for those IDs from the `profiles` table (`id, full_name, employee_code`)
3. Build a `Map<string, { name, code }>` and store in state
4. Pass it as the `employeeNames` prop to `IncentiveDryRunDialog`

```typescript
// After dry run returns results:
const ids = data.records.map(r => r.employee_id);
const { data: profiles } = await supabase
  .from('profiles')
  .select('id, full_name, employee_code')
  .in('id', ids);

const nameMap = new Map(
  profiles?.map(p => [p.id, { name: p.full_name || 'Unknown', code: p.employee_code || '' }])
);
setEmployeeNameMap(nameMap);
```

### Files Modified

| File | Change |
|------|--------|
| `src/components/incentive/MonthlyIncentiveTable.tsx` | Fetch employee names after dry run, pass to dialog |
| `DOCUMENTATION.md` | v2.15.19 |

### Risk Assessment
- **Regression**: Zero — additive prop that was already supported but unused
- **Performance**: Single query for batch of employee IDs after dry run

