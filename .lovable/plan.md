

## Fix: Port Incentive Detection — Use Vessel Rates Query Instead of `incentive_base`

### Problem
The current condition `incentive_base === 'fixed'` never matches because Port Incentive uses `incentive_base = 'basic_salary'`. The distinguishing factor is that Port Incentive programs have **vessel rates configured** in `incentive_vessel_rates`.

### UI After Fix

When user selects **Port Incentive** from the program dropdown:

```text
┌──────────────────────────────────────────────────────────────────────┐
│  Program: [Port Incentive ▼]     Month: [January ▼]   Year: [2026▼]│
├──────────────────────────────────────────────────────────────────────┤
│  🚢 Vessel Data Entry                                               │
├──────────┬────────┬──────────────┬────────────────┬─────────┬───────┤
│ Employee │ Code   │ Rate/Vessel ₹│ Vessels Handled│ Total ₹ │Remarks│
├──────────┼────────┼──────────────┼────────────────┼─────────┼───────┤
│ Abhas    │ 100020 │ 5,000        │ [  3  ]        │ ₹15,000 │ [   ] │
│ Ravi K   │ 100045 │ 4,500        │ [  5  ]        │ ₹22,500 │ [   ] │
├──────────┴────────┴──────────────┴────────────────┴─────────┴───────┤
│ Grand Total: ₹37,500                              [ 💾 Save All ]  │
└──────────────────────────────────────────────────────────────────────┘
```

When user selects a **slab-based program** (e.g., Production Incentive), the existing `ProductionTargetGrid` renders with Sub-Unit, Category, Target, Achieved columns as before.

### Changes

**`src/components/incentive/UnifiedProductionDataTab.tsx`**
- Add a `useQuery` that counts rows in `incentive_vessel_rates` for the selected `program_id`
- Replace `incentive_base === 'fixed'` with `vesselRateCount > 0`
- Show a brief skeleton/loading while the count query resolves

```typescript
const { data: vesselRateCount, isLoading: countLoading } = useQuery({
  queryKey: ['vessel-rate-count', selectedProgramId],
  enabled: !!selectedProgramId,
  queryFn: async () => {
    const { count, error } = await supabase
      .from('incentive_vessel_rates')
      .select('id', { count: 'exact', head: true })
      .eq('program_id', selectedProgramId);
    if (error) throw error;
    return count ?? 0;
  },
});
const isVesselProgram = (vesselRateCount ?? 0) > 0;
```

**`DOCUMENTATION.md`** — v2.15.10 changelog

### Files Modified

| File | Change |
|------|--------|
| `src/components/incentive/UnifiedProductionDataTab.tsx` | Query vessel rates count; use count > 0 for grid toggle |
| `DOCUMENTATION.md` | v2.15.10 changelog |

### Risk Assessment
- **Regression**: Zero — only changes the boolean condition; both grids untouched
- **Data**: No schema changes
- **Performance**: `head: true` count query is lightweight (no row data fetched)

