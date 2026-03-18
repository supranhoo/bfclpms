

## RCA: "Apply from this month onward" toggle doesn't update existing configs

### Root Cause

The `isOngoing` toggle on the Workflow Config page is a **local UI state** (`useState(false)` at line 75). It only takes effect when a **new assignment is saved** (line 201). It does NOT retroactively update existing configs for the selected period.

**DB evidence for Bhoopendra (101131):**
- Feb 2026 config: `is_ongoing: false`, template: `self_l1_audit` (5-stage, no HR PMS)
- Global config: `is_ongoing: false`, template: `self_l1_hr_pms` (includes HR PMS)
- No March 2026 config exists

**What happens for March 2026:** The `get_employee_workflow` RPC finds no exact March config, no ongoing config (Feb has `is_ongoing: false`), falls through to the **global** config → `self_l1_hr_pms` → HR PMS stage appears.

The user expected that checking "Apply from this month onward" would update the existing Feb config's `is_ongoing` flag to `true`, making it carry forward to March. But the toggle only affects **future saves**, not existing records.

### Fix

**1. `src/pages/admin/WorkflowConfig.tsx` — Sync existing configs when toggle changes**

Add an effect or handler: when the user toggles `isOngoing` ON/OFF while in "Specific Period" mode, batch-update all existing `workflow_config` rows for the selected period (`review_period = selectedMonth, review_year = selectedYear`) to set `is_ongoing` to the new value. This ensures the toggle reflects reality for already-saved configs.

Implementation:
- Add a new mutation hook `useUpdateOngoingFlag` (or inline) that runs:
  ```sql
  UPDATE workflow_config 
  SET is_ongoing = $newValue 
  WHERE review_period = $month AND review_year = $year
  ```
- Call it in the `setIsOngoing` handler (line 368) after state update
- Show a toast confirming "Updated X existing config(s) to ongoing/single-period"
- Invalidate `workflow-configs` query cache

**2. `src/hooks/useWorkflowConfig.ts` — Add batch ongoing update mutation**

Add a new mutation:
```typescript
export function useUpdateBatchOngoing() {
  return useMutation({
    mutationFn: async ({ reviewPeriod, reviewYear, isOngoing }) => {
      const { data, error } = await supabase
        .from('workflow_config')
        .update({ is_ongoing: isOngoing })
        .eq('review_period', reviewPeriod)
        .eq('review_year', reviewYear)
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-configs'] });
      queryClient.invalidateQueries({ queryKey: ['employee-workflow'] });
      queryClient.invalidateQueries({ queryKey: ['employee-workflow-stages'] });
    },
  });
}
```

**3. `src/pages/admin/WorkflowConfig.tsx` — Wire toggle to batch update**

Replace the simple `onChange` at line 368:
```typescript
onChange={(e) => {
  const newVal = e.target.checked;
  setIsOngoing(newVal);
  // Batch-update existing configs for this period
  if (filteredConfigs.some(c => c.review_period === selectedMonth && c.review_year === selectedYear)) {
    batchUpdateOngoing({ reviewPeriod: selectedMonth, reviewYear: selectedYear, isOngoing: newVal });
  }
}}
```

This ensures that toggling "Apply from this month onward" immediately updates all existing period configs, so Bhoopendra's Feb 2026 config becomes `is_ongoing: true` and correctly propagates to March.

