

## Plan: Empty-State CTA for Incentive Report

User picked Option B. Add a friendly empty-state in the Incentive Report that detects mapped employees and offers a one-click Compute.

### Changes

**1. New hook** `src/hooks/useIncentiveProgramMappingCount.ts`
- Counts active rows in `incentive_program_mappings` for a given `program_id`.
- Disabled when `programId === 'all'` or empty.

**2. Update `MonthlyIncentiveTable.tsx`**
- When `aggregatedRows.length === 0` AND a specific program is selected AND mapping count > 0:
  - Replace the bare "No records found" row with a centered hint card:
    - Icon + heading "No incentive records yet"
    - Body: "{N} employee(s) are mapped to this programme. Click below to compute incentives for {Month} {Year}."
    - Primary button: **Compute Now** → calls existing `useComputeIncentives` mutation with current `{review_period, review_year, program_id}`. Disabled if month/year = 'all'.
- When no program selected OR mapping count = 0: keep current generic empty message (with hint to map employees first if count = 0).

### UI Mock

```text
┌────────────────────────────────────────────────────┐
│              📊  No incentive records yet          │
│                                                    │
│  2 employee(s) are mapped to "Port Incentive".     │
│  Click below to compute incentives for Jan 2026.   │
│                                                    │
│              [ ▶  Compute Now ]                    │
└────────────────────────────────────────────────────┘
```

### Files Touched

| File | Change |
|------|--------|
| `src/hooks/useIncentiveProgramMappingCount.ts` (new) | Count query for `incentive_program_mappings` |
| `src/components/incentive/MonthlyIncentiveTable.tsx` | Replace empty `<TableRow>` with conditional hint card + Compute CTA |

### Risk & Impact

| Area | Impact |
|------|--------|
| Data | None — read-only count + reuses existing compute mutation |
| Workflow | None — same Compute action as toolbar button |
| Regression | Low — purely additive empty-state UI |
| Mitigation | Falls back to generic message when filters are 'all' or count is 0 |

