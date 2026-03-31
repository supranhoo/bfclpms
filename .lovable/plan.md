

## Plan: Daily Achievement Grid with Per-Ton Rate & Date Range Filter

### Overview
Build the production daily entry system for programs like "Metal Sizing" — auto-populates mapped employees (no BU dropdown), with day-wise achievement entry for a selected month/year, per-ton rates, and a **date range toggle** (1-10, 11-20, 21-31, All).

### Database Changes

**Table 1: `incentive_production_rates`**
```sql
CREATE TABLE public.incentive_production_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES incentive_programs(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rate_per_ton NUMERIC NOT NULL DEFAULT 0,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(program_id, employee_id)
);
-- RLS: authenticated full access
```

**Table 2: `production_daily_entries`**
```sql
CREATE TABLE public.production_daily_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES incentive_programs(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  year INT NOT NULL,
  daily_values JSONB NOT NULL DEFAULT '{}',
  -- e.g. {"1": 10, "2": 15, "31": 12}
  updated_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(program_id, employee_id, month, year)
);
-- RLS: authenticated full access
```

### UI Layout

```text
Production Data — Metal Sizing
┌────────────────────────────────────────────────────────────────────────┐
│ Month: [March ▼]  Year: [2026 ▼]  Dates: [All] [1-10] [11-20] [21-31]│
├────────────────────────────────────────────────────────────────────────┤
│ Code │ Name       │ Desig  │ Dept   │ Rate/Ton │ 1 │ 2 │...│ 31│Total│ Amt │
│ ─────┼────────────┼────────┼────────┼──────────┼───┼───┼───┼───┼─────┼─────│
│ E001 │ Jaspal     │ Opr    │ Sizing │ ₹500     │[_]│[_]│   │[_]│ 120 │₹60K │
│ E002 │ Ravi       │ Opr    │ Sizing │ ₹450     │[_]│[_]│   │[_]│  98 │₹44K │
│                                                     Grand Total: ₹1.04L    │
│                                                              [Save All]    │
└────────────────────────────────────────────────────────────────────────┘
```

- **Date range toggle**: ToggleGroup with 4 options — `All`, `1-10`, `11-20`, `21-31`. Only visible date columns are shown; Total/Amount always reflect ALL days regardless of filter.
- Sticky left columns (Code, Name, Desig, Dept, Rate/Ton) with horizontal scroll for date columns.
- Days beyond month length are hidden (e.g., Feb shows 1-28/29).

### Detection Logic Update (`UnifiedProductionDataTab`)

```text
1. Has vessel rates → VesselDataEntryGrid (existing)
2. Has production rates → ProductionDailyGrid (NEW)
3. Neither → ProductionTargetGrid (existing slab-based)
```

### Programme Config: Production Rates Tab

Add a **"Production Rates"** core tab inside each program (alongside Vessel Rates) — a simple per-employee grid to set `rate_per_ton`. Employees come from programme mappings.

### Code Changes

| File | Change |
|------|--------|
| DB migration | Create `incentive_production_rates` + `production_daily_entries` |
| `src/hooks/useProductionDailyEntries.ts` | New — hooks for rates CRUD + daily entries fetch/upsert |
| `src/components/incentive/ProductionDailyGrid.tsx` | New — daily grid with date range toggle, rate display, totals |
| `src/components/incentive/ProductionRatesTab.tsx` | New — per-employee rate config in programme settings |
| `src/components/incentive/UnifiedProductionDataTab.tsx` | Add production rate detection; render `ProductionDailyGrid` |
| `src/pages/admin/IncentiveConfig.tsx` | Add "Production Rates" tab in `ProgramInnerTabs` |
| `DOCUMENTATION.md` | v2.15.24 |
| `POLICY.md` | §44 — Production daily entry governance |

### Risk Assessment
- **Regression**: Zero — additive tables and components
- **Performance**: JSONB daily values = 1 row per employee/month; date range filter is purely UI-side
- **Data**: No existing schema modifications

