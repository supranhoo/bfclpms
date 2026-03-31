

## Plan: Multi-Mode Production Rates (Employee / Department / BU / Common)

### Problem
Currently, production rates can only be set per individual employee. The user wants flexibility to assign rates at 4 levels:
1. **Employee-wise** — current behavior, per-employee rate
2. **Department-wise** — one rate applies to all employees in a department
3. **BU-wise** — one rate applies to all employees in a business unit
4. **Common** — single rate for all mapped employees in the program

### Database Change

Add `rate_type` and `entity_id` columns to `incentive_production_rates`. Make `employee_id` nullable (only used for employee-wise). Add a new column for rate assignment scope.

```sql
ALTER TABLE public.incentive_production_rates
  ADD COLUMN rate_type TEXT NOT NULL DEFAULT 'employee'
    CHECK (rate_type IN ('employee', 'department', 'bu', 'common')),
  ADD COLUMN entity_id UUID; -- department_id or bu_id depending on rate_type

ALTER TABLE public.incentive_production_rates
  ALTER COLUMN employee_id DROP NOT NULL;

-- Drop old unique constraint, add new one
ALTER TABLE public.incentive_production_rates
  DROP CONSTRAINT IF EXISTS incentive_production_rates_program_id_employee_id_key;

ALTER TABLE public.incentive_production_rates
  ADD CONSTRAINT incentive_production_rates_unique_rate
    UNIQUE (program_id, rate_type, employee_id, entity_id);
```

### UI Layout

```text
Production Rates (Per Ton)
┌─────────────────────────────────────────────────────────────────┐
│ Rate Type: (●) Employee  ( ) Department  ( ) BU  ( ) Common    │
│                                                                 │
│ [+ Add Rate]                                                    │
├─────────────────────────────────────────────────────────────────┤
│ When "Employee":                                                │
│   Select Employee ▼  |  Rate  |  Remarks  |  [Add]              │
│                                                                 │
│ When "Department":                                              │
│   Select Department ▼  |  Rate  |  Remarks  |  [Add]            │
│                                                                 │
│ When "BU":                                                      │
│   Select BU ▼  |  Rate  |  Remarks  |  [Add]                   │
│                                                                 │
│ When "Common":                                                  │
│   Rate  |  Remarks  |  [Add]  (applies to ALL mapped employees) │
├─────────────────────────────────────────────────────────────────┤
│ Table shows:                                                    │
│ Type │ Applies To      │ Rate/Ton │ Remarks │ Actions           │
│ Emp  │ Jaspal Singh    │ ₹500     │ ...     │ Edit | Delete     │
│ Dept │ Sizing Dept     │ ₹450     │ ...     │ Edit | Delete     │
│ BU   │ Manufacturing   │ ₹400     │ ...     │ Edit | Delete     │
│ Com  │ All Employees   │ ₹350     │ ...     │ Edit | Delete     │
└─────────────────────────────────────────────────────────────────┘
```

### Rate Resolution in Daily Grid

When `ProductionDailyGrid` renders, it resolves each employee's effective rate using **priority order**: Employee > Department > BU > Common. The first match wins.

### Code Changes

| File | Change |
|------|--------|
| DB migration | Add `rate_type`, `entity_id` columns; make `employee_id` nullable; update unique constraint |
| `src/components/incentive/ProductionRatesTab.tsx` | Add rate type radio/toggle, dynamic entity selector (employee/dept/BU/none), update table columns |
| `src/hooks/useProductionDailyEntries.ts` | Update upsert to include `rate_type`/`entity_id`; update query joins for dept/BU names; add rate resolution helper |
| `src/components/incentive/ProductionDailyGrid.tsx` | Resolve effective rate per employee using priority cascade (employee > dept > BU > common) |
| `DOCUMENTATION.md` | v2.15.25 |
| `POLICY.md` | Update §44 with multi-mode rate assignment |

### Risk Assessment
- **Regression**: Low — existing employee-wise rates will have `rate_type='employee'` by default
- **Data**: Backward-compatible — default value ensures existing rows work unchanged
- **Performance**: Rate resolution is client-side over a small dataset (rates per program)

