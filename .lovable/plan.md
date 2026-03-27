

## Simplified Production Incentive UI + Manual Status Override

### New Requirement (Condition 16)
**Manual incentive status override**: Admins must be able to manually change "hold" status to "released" (or other statuses). This prevents stale "hold" labels on reports generated months later, even after payment was made outside the system.

### UI Simplification Strategy

Instead of nested accordions (Division → BU → Sub-unit → Category), the UI uses a **flat, filter-driven approach** — the same pattern already used in `IncentiveSlabEditor.tsx` and `MonthlyIncentiveTable.tsx`.

#### Simplified Layout (3 top-level tabs on IncentiveConfig page)

```text
┌─────────────┬──────────────────┬─────────────────┐
│  Programs   │ Production Data  │ Eligibility     │
└─────────────┴──────────────────┴─────────────────┘
```

**Programs tab** (existing — enhanced):
- Accordion per program with sub-tabs: Mapping | Slabs | DQ Rules | Fields | BU & Sub-units | Allocation Rules
- BU Manager and Allocation Rules are inline sub-tabs (not separate pages)
- Program create/edit dialogs get 3 new fields: incentive_base, min_kra_score, no_kra_eligible

**Production Data tab** (new — simple flat grid):
- Top bar: Program selector + Division selector + BU selector + Month/Year pickers (cascading filters)
- Below: Simple editable table with columns: Sub-Unit | Category | Target | Achieved | Incentive % | Remarks
- One "Save All" button. Auto-resolves incentive % from matching slabs on blur.
- No nested accordions — just filter and edit.

**Eligibility tab** (existing — unchanged)

#### MonthlyIncentiveTable enhancements:
- New **Incentive Status** column with color badges (Finalised=green, Hold=amber, Forfeited=red, Released=blue)
- New **status filter** dropdown in filter bar
- **Manual status override**: Each row gets a small edit icon on the status badge. Clicking opens a popover/dropdown allowing admin to change status (hold→released, etc.) with a mandatory reason field. This is logged to audit.

### Database Changes

**a) Alter `incentive_programs`** — 3 new columns:
- `incentive_base text DEFAULT 'basic_salary'`
- `min_kra_score numeric DEFAULT 3.0`
- `no_kra_eligible boolean DEFAULT true`

**b) Alter `incentive_slabs`** — 2 new columns:
- `department_id uuid REFERENCES departments(id)`
- `applicable_designations text[]`

**c) Alter `employee_incentive_records`** — 2 new columns:
- `incentive_status text DEFAULT 'hold'` (values: finalised, hold, forfeited, released)
- `status_override_reason text` (captures why admin manually changed status)
- `status_overridden_by uuid REFERENCES auth.users(id)`
- `status_overridden_at timestamptz`

**d) New table: `production_targets`**
Monthly actuals per BU/sub-unit/category. Columns: program_id, division_id, business_unit_id, department_id, sub_unit_label, slab_category, month, year, target_value, achieved_value, incentive_percent, remarks, updated_by. Unique composite key. RLS: authenticated read, admin write.

**e) New table: `business_unit_sub_units`**
business_unit_id, label, capacity, product_types, sort_order, is_active. Unique on (business_unit_id, label). RLS: authenticated read, admin write.

**f) New table: `incentive_allocation_rules`**
program_id, source_label, target_bu_id, target_sub_unit, allocation_pct, sort_order. Sum validated to 100% per source_label. RLS: authenticated read, admin write.

### Files

| File | Action | Purpose |
|------|--------|---------|
| DB Migration | New | 3 tables + columns on 3 existing tables |
| `src/components/incentive/ProductionTargetGrid.tsx` | New | Flat filter-driven editable grid for production data |
| `src/components/incentive/BusinessUnitManager.tsx` | New | Inline BU + sub-unit CRUD (simple table, not nested) |
| `src/components/incentive/AllocationRulesEditor.tsx` | New | Weighted split config with 100% validation |
| `src/components/incentive/IncentiveStatusOverride.tsx` | New | Popover for manual status change with reason |
| `src/hooks/useProductionTargets.ts` | New | Fetch/upsert production targets, sub-units, allocation rules |
| `src/pages/admin/IncentiveConfig.tsx` | Update | Add Production Data tab, BU/Allocation sub-tabs, program settings fields |
| `src/components/incentive/IncentiveSlabEditor.tsx` | Update | Add department filter, negative %, designation multi-select |
| `src/components/incentive/MonthlyIncentiveTable.tsx` | Update | Add incentive_status column + manual override + status filter |
| `src/hooks/useIncentivePrograms.ts` | Update | New columns in mutations |
| `src/hooks/useIncentiveRecords.ts` | Update | Include incentive_status, add override mutation |
| `supabase/functions/compute-monthly-incentives/index.ts` | Update | Status resolution + production target matching + allocation blending |
| `DOCUMENTATION.md`, `POLICY.md` | Update | Version history |

### Incentive Status Logic

```text
Auto-computed:
  1. Check DQ rules → 'forfeited'
  2. Check KRA approval → 'finalised' or 'hold'
  3. No-KRA + no_kra_eligible → 'finalised' (unless forfeited)

Manual override:
  Admin can change hold → released (or any status)
  Override is logged with reason, user, timestamp
  Once overridden, auto-compute won't revert it (flag protects it)
```

### Risk Assessment
- **Data**: All additive. Defaults on new columns. Zero existing data impact.
- **Regression**: Zero. Existing slab/DQ/eligibility logic untouched.
- **UI**: Simplified — uses existing filter+table patterns, no deep nesting.

