

## Port Incentive: Per-Vessel Fixed Amount Configuration

### What You Asked For
Configure "Port Incentive" with two criteria:
1. Monthly KRA rating minimum 3 (auto-fetched from system)
2. Fixed incentive amount per vessel (default ₹10,000), applicable to 3-4 employees with employee-wise varying amounts

### Current State
- `min_kra_score` already exists on `incentive_programs` — set to 3 for this program. KRA scores are already fetched from the system during computation.
- `incentive_base = 'fixed'` exists but only supports a single fixed amount. There is **no per-employee, per-vessel rate** configuration.
- The current slab system is percentage-based, not suited for "₹X per vessel per employee."

### What's Needed
A new **Vessel Rate Configuration** table and UI tab to store per-employee fixed amounts per vessel for this program type.

### Implementation

#### 1. Database Migration
```sql
CREATE TABLE public.incentive_vessel_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES incentive_programs(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rate_per_vessel NUMERIC NOT NULL DEFAULT 10000,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (program_id, employee_id)
);
-- RLS: authenticated read, admin write
```

#### 2. New Hook: `src/hooks/useIncentiveVesselRates.ts`
- `useVesselRates(programId)` — fetch all rates with employee profile join
- `useUpsertVesselRate()` — upsert rate per employee
- `useDeleteVesselRate()` — remove an employee's rate

#### 3. New Component: `src/components/incentive/VesselRateEditor.tsx`
UI within the Port Incentive program accordion:

```text
┌─────────────────────────────────────────────────────┐
│  Vessel Rate Configuration                          │
│  Per-employee fixed amount per vessel handled       │
│                                                     │
│  ┌──────────────┬────────────┬──────────┬────────┐  │
│  │ Employee     │ Code       │ Rate/Vessel│Actions│  │
│  ├──────────────┼────────────┼──────────┼────────┤  │
│  │ John Doe     │ EMP001     │ ₹12,000  │ ✎  🗑  │  │
│  │ Jane Smith   │ EMP002     │ ₹10,000  │ ✎  🗑  │  │
│  │ Ravi Kumar   │ EMP003     │ ₹8,000   │ ✎  🗑  │  │
│  └──────────────┴────────────┴──────────┴────────┘  │
│                                                     │
│  [+ Add Employee]  ← employee search + rate input   │
│                                                     │
│  ℹ Min KRA Score: 3.0 (auto-fetched from system)    │
│  ℹ Incentive Base: Fixed Amount per Vessel          │
└─────────────────────────────────────────────────────┘
```

- Employee search dropdown (from profiles, filtered to mapped employees)
- Rate per vessel input (₹, default 10,000)
- Inline edit and delete
- Info banner showing that KRA rating ≥ 3 is enforced automatically

#### 4. IncentiveConfig.tsx Update
Add a "Vessel Rates" tab inside the program accordion, visible when `incentive_base === 'fixed'` or `program_type` matches port/vessel-related types.

### Files Changed
| File | Action |
|------|--------|
| Migration SQL | Create `incentive_vessel_rates` table |
| `src/hooks/useIncentiveVesselRates.ts` | New — CRUD hook for vessel rates |
| `src/components/incentive/VesselRateEditor.tsx` | New — per-employee rate grid UI |
| `src/pages/admin/IncentiveConfig.tsx` | Update — add "Vessel Rates" tab |
| `DOCUMENTATION.md` | Update — document vessel rate feature |

### Program Setup Summary
For the "Port Incentive" program, admin should:
1. Set `Incentive Base = Fixed Amount` and `Min KRA Score = 3.0` in Edit Program
2. Map 3-4 employees via Mapping tab
3. Configure per-employee vessel rates in the new Vessel Rates tab
4. Monthly computation will: fetch KRA score from system → check ≥ 3 → multiply rate × vessels handled

### Risk Assessment
- **Data**: Additive — new table, no changes to existing schema
- **Regression**: Zero — new tab only appears for relevant programs
- **Security**: RLS admin-only write, authenticated read

