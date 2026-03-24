

## Complete Incentive Module Plan

### Overview

Build a fully configurable Incentive Module with two tracks — **Production & Maintenance** (CLU, FAD, SMS, DRI, CPP) and **Support Functions** (KRA/PMS score-based) — with disqualification data capture, retroactive adjustment detection for Quarterly/Bi-Monthly KPIs, and detailed payroll reports.

---

### Part 1: Database Schema (6 tables, 1 migration)

**Table 1: `incentive_programs`**
```
id uuid PK, name text, program_type text ('production'|'support'),
description text, is_active boolean DEFAULT true,
effective_from date, effective_to date,
created_by uuid, created_at timestamptz, updated_at timestamptz
```

**Table 2: `incentive_slabs`** — All slab types in one table, zero hardcoding
```
id uuid PK, program_id uuid FK→incentive_programs,
business_unit_id uuid (nullable — for production BUs),
slab_category text ('production'|'availability'|'maintenance'|'pms_score'|'metal_recovery'),
sub_category text (nullable — e.g. 'F1_F2', 'F3', 'F4', 'F5', 'WHRB', 'AFBC',
   'fines_recovery', 'saleable_recovery', 'DRI1', 'DRI2', 'CPP1_8MW', 'CPP2_45MW'),
min_value numeric, max_value numeric,
incentive_percent numeric, rating_label text ('R-0' to 'R-5'),
sort_order int, created_at, updated_at
```
Covers: CLU production/availability/maintenance slabs, FAD furnace-wise production slabs, FAD availability/maintenance, SMS production, DRI1/DRI2/CPP1/CPP2 production, CLU fines & saleable recovery, and Support PMS score slabs.

**Table 3: `incentive_disqualification_rules`** — Configurable thresholds
```
id uuid PK, program_id uuid FK→incentive_programs,
rule_type text ('absence'|'lwp'|'warning'|'suspension'|'contract'|'lti'),
rule_config jsonb, is_active boolean DEFAULT true, exemption_notes text,
created_at, updated_at
```
Example JSONB configs:
- LWP: `{"max_lwp_days": 3, "exempt_roles": ["bu_head", "division_head", "plant_head"]}`
- LTI: `{"lti_1_penalty_percent": 50, "lti_2_plus_penalty_percent": 100, "scope": "department", "aggregate_for_heads": true}`
- Contract: `{"ineligible": true, "exempt_bus": ["SMS"]}`

**Table 4: `employee_incentive_eligibility`** — Monthly disqualification data entry
```
id uuid PK, employee_id uuid, review_period text, review_year int,
absent_days int DEFAULT 0,
lwp_days numeric DEFAULT 0,
has_warning_letter boolean DEFAULT false,
is_suspended boolean DEFAULT false,
is_contract_worker boolean DEFAULT false,
lti_count int DEFAULT 0,
department_lti_count int DEFAULT 0,
total_working_days int,
present_days numeric,
weekly_off_days int,
production_value numeric (for production employees),
availability_percent numeric,
shutdown_hours numeric,
remarks text,
entered_by uuid, created_at, updated_at
```
This is the external data not available in PMS — HR enters monthly via UI or Excel import.

**Table 5: `employee_incentive_records`** — Computed monthly results
```
id uuid PK, employee_id uuid, program_id uuid FK,
review_period text, review_year int,
pms_score numeric (for support — weighted avg using scoring engine),
production_value numeric (for production),
matched_slab_id uuid FK→incentive_slabs,
base_incentive_percent numeric (from slab),
is_disqualified boolean DEFAULT false,
disqualification_reasons text[] (array of reasons),
lti_penalty_percent numeric DEFAULT 0,
pro_rata_factor numeric DEFAULT 1.0,
final_incentive_percent numeric (after DQ + LTI + pro-rata),
is_retroactive_adjustment boolean DEFAULT false,
original_score numeric, adjusted_score numeric,
adjustment_source_period text,
status text DEFAULT 'draft' ('draft'|'confirmed'|'paid'),
computed_at timestamptz, confirmed_by uuid,
created_at, updated_at
```

**Table 6: `incentive_score_revisions`** — Retroactive adjustment tracking
```
id uuid PK, employee_id uuid, affected_period text, affected_year int,
original_score numeric, revised_score numeric,
original_slab_percent numeric, revised_slab_percent numeric,
revision_reason text ('quarterly_kpi_resolved'|'bimonthly_kpi_resolved'|'manual_correction'),
source_kpi_id uuid, source_period text,
is_payroll_notified boolean DEFAULT false, notified_at timestamptz,
created_at
```

**RLS policies** (all tables):
- Admin: full CRUD via `has_role(auth.uid(), 'admin')`
- HR/Management: SELECT all via `has_role(auth.uid(), 'management') OR has_role(auth.uid(), 'hr_pms')`
- Employees: SELECT own rows on `employee_incentive_records` where `employee_id = auth.uid()`

---

### Part 2: Admin Configuration UI — `/admin/incentive-config`

**4-tab layout:**

**Tab 1: Programs** — Create/edit incentive programs (Production, Support). Fields: name, type, description, effective dates, active toggle.

**Tab 2: Slabs** — Dynamic slab editor per program/BU
- For **Support**: Score range → Incentive % grid (e.g., 4.76+ → 20%, 4.51-4.75 → 15%, etc.)
- For **Production**: BU selector → sub-category selector (e.g., CLU→Production, CLU→Availability, FAD→F1&F2, FAD→F3, SMS→Production, DRI1, CPP1_8MW, etc.) → editable slab table
- Inline add/edit/delete rows with min/max values, incentive %, rating label
- All values stored in DB — nothing hardcoded

**Tab 3: Disqualification Rules** — Per-program rule config
- Absence threshold (default: 1 day → full DQ)
- LWP threshold (default: 3 days → pro-rata). Pro-rata formula: `(present_days + weekly_offs) / total_working_days`. Exemptions for BU/Division/Plant heads (configurable)
- Warning letter, suspension → full DQ
- Contract worker exclusion (with SMS exemption toggle)
- LTI rules: 1 LTI → 50% penalty, 2+ → 100%. Department-level scope. Aggregation for BU heads across departments.

**Tab 4: Eligibility Data Entry** — Monthly per-employee grid
- Month/Year selector
- Filterable employee table with columns: Employee Code, Name, Department, BU, Absent Days, LWP Days, Warning (Y/N), Suspended (Y/N), Contract (Y/N), LTI Count, Dept LTI Count, Production Value, Availability %, Shutdown Hours
- Pre-populated with zeros — HR fills in exceptions only
- **Bulk Excel Import** button (same pattern as `OrgKpiBulkImport`): upload sheet with Employee Code + all fields
- **Bulk Excel Export** template download
- Status indicator: auto-shows computed eligibility (Eligible / Disqualified / Pro-rata) with reason

---

### Part 3: Score Computation — Following the Scoring Engine

For **Support Functions**, incentive PMS score uses the exact same logic as `ManagementDashboard.tsx`:

```typescript
const getScore = (kpi: any): number | null => {
  const s = kpi.review_submissions;
  if (!s || s.is_na) return null;  // N/A exclusion
  return (kpi.status === 'approved' ? s.final_score : null)
    ?? s.management_score ?? s.auditor_score
    ?? s.hr_pms_score ?? s.skip_level_score
    ?? s.manager_score ?? s.self_score ?? null;
};

// Weighted average: Σ(score × weightage) / Σ(weightage) — N/A KPIs excluded from both
```

For **Production**, score comes from `employee_incentive_eligibility.production_value` entered by HR/MIS team.

**Slab matching**: Query `incentive_slabs` where value falls between `min_value` and `max_value` for the relevant `slab_category` + `sub_category` + `business_unit_id`.

**Disqualification evaluation** (in order):
1. `absent_days >= 1` → Full DQ
2. `has_warning_letter` → Full DQ
3. `is_suspended` → Full DQ
4. `is_contract_worker` AND BU not in exempt list → Full DQ
5. `lwp_days > threshold` AND employee not exempt → Pro-rata: `final_incentive = base × (present_days + weekly_offs) / total_working_days`
6. LTI check (department-level): `lti_count = 1` → 50% penalty; `lti_count >= 2` → 0%. For BU heads: use `department_lti_count` aggregated across all departments.

**Final incentive %** = `base_incentive × (1 - lti_penalty) × pro_rata_factor × (disqualified ? 0 : 1)`

---

### Part 4: Retroactive Adjustment Detection (Yogesh Trikha Scenario)

**How it works:**

1. Yogesh scores 3.9 in January (monthly KPIs only) → Slab "Below 4.00" → 0% incentive
2. His Quarterly KPI (Q1: Jan-Mar) gets approved in April when terminal month (March) is processed
3. System recalculates January's weighted average including the now-resolved Q1 KPI score
4. Recalculated score = 4.1 → Slab "4.00-4.25" → 5% incentive
5. `incentive_score_revisions` record created: original 3.9 → revised 4.1, slab 0% → 5%
6. Payroll user sees this in Retroactive Adjustment Report

**Detection logic** (edge function `detect-retroactive-incentive-changes`):
- Triggered when admin runs monthly incentive computation OR manually
- Uses `getCycleMonths(frequency, review_period, review_year)` from `frequencyUtils.ts` to identify which past months a Quarterly/Bi-Monthly KPI affects
- For each affected past month: recalculate weighted average using full 8-stage fallback + N/A exclusion
- Compare with existing `employee_incentive_records` — if slab changed, insert `incentive_score_revisions`

---

### Part 5: Reports — `/reports/incentive`

**2-tab layout:**

#### Tab A: Monthly Incentive Report

**Filters:** Month/Year (required), Program Type, Department, BU, Status (Draft/Confirmed/Paid), Eligibility (Eligible/Disqualified/Pro-rata)

**Summary cards at top:**
- Total Employees | Eligible Count | Disqualified Count | Pro-rata Count | Avg Incentive %

**Columns (Support Functions):**

| Column | Source |
|--------|--------|
| Employee Code | profiles |
| Employee Name | profiles |
| Department | departments |
| Designation | profiles |
| PMS Score (Weighted Avg) | Scoring engine |
| Matched Slab | incentive_slabs (e.g., "4.26-4.50") |
| Base Incentive % | From slab |
| Absent Days | eligibility table |
| LWP Days | eligibility table |
| Warning Letter | Y/N |
| Suspended | Y/N |
| Dept LTI Count | eligibility table |
| Eligibility Status | Eligible / Disqualified / Pro-rata |
| DQ Reason | Auto-generated (e.g., "Absent 1 day", "LWP > 3 days") |
| LTI Penalty | 0% / 50% / 100% |
| Pro-rata Factor | present_days / total_days (if applicable) |
| Final Incentive % | After all adjustments |

**Columns (Production):** Same DQ columns plus Production Achievement %, Availability %, Shutdown Hours, and per-category slab incentives (Production Slab %, Availability Slab %, Maintenance Slab %).

**Actions:** Export to Excel (2 sheets: Summary + Detail). Confirm button to move from draft → confirmed. Mark as paid.

#### Tab B: Retroactive Adjustment Report

**Filters:** Resolution Month, Affected Month, Slab Change Only toggle, Payroll Status

**Columns:**

| Column | Description |
|--------|-------------|
| Employee Code/Name | |
| Department | |
| Affected Month | Past month whose score changed |
| Original Score | When incentive was first computed |
| Revised Score | After Q/BM KPI finalization |
| Score Delta | Revised - Original |
| Original Slab → New Slab | e.g., "0% → 5%" |
| Incentive Delta | e.g., "+5%" |
| Source KPI | The Q/BM KPI that triggered the change |
| Resolution Month | When that KPI was approved |
| Payroll Status | Pending / Notified / Processed |

**Actions:** "Mark as Notified" button per row. Bulk "Mark All Notified". Export to Excel.

---

### Part 6: Edge Functions

**`supabase/functions/compute-monthly-incentives/index.ts`**
- Input: `{ review_period, review_year, program_type? }`
- Fetches all employees, their KPIs (with paginated fetch to avoid 1000-row limit), eligibility data, and applicable slabs
- Computes PMS weighted avg using scoring engine pattern
- Matches slabs, evaluates DQ rules, calculates final incentive %
- Upserts into `employee_incentive_records`
- Runs retroactive detection for any Quarterly/Bi-Monthly KPIs that resolved in this period
- Returns summary counts

**`supabase/functions/detect-retroactive-incentive-changes/index.ts`**
- Input: `{ review_period, review_year }`
- Finds all Q/BM KPIs approved in this period
- For each affected past month, recalculates weighted avg
- Compares with existing records, creates `incentive_score_revisions` if slab moved

---

### Part 7: Frontend Files

**New pages:**
- `src/pages/admin/IncentiveConfig.tsx` — 4-tab admin config
- `src/pages/reports/IncentiveReport.tsx` — 2-tab report page

**New components:**
- `src/components/incentive/IncentiveSlabEditor.tsx` — Dynamic slab grid editor
- `src/components/incentive/DisqualificationRulesEditor.tsx` — Rule configuration
- `src/components/incentive/EligibilityDataEntry.tsx` — Monthly HR data entry grid
- `src/components/incentive/EligibilityBulkImport.tsx` — Excel upload (OrgKpiBulkImport pattern)
- `src/components/incentive/MonthlyIncentiveTable.tsx` — Report table
- `src/components/incentive/RetroactiveAdjustmentTable.tsx` — Adjustment report

**New hooks:**
- `src/hooks/useIncentivePrograms.ts` — CRUD for programs, slabs, rules
- `src/hooks/useIncentiveEligibility.ts` — Eligibility data entry CRUD
- `src/hooks/useIncentiveRecords.ts` — Fetch computed records
- `src/hooks/useIncentiveRevisions.ts` — Retroactive revision listing

**Modified files:**
- `src/App.tsx` — Add lazy routes: `/admin/incentive-config`, `/reports/incentive`
- `src/components/layout/AppSidebar.tsx` — Add menu items:
  - Admin: `{ title: 'Incentive Config', icon: Percent, path: '/admin/incentive-config', roles: ['admin'] }`
  - Reports: `{ title: 'Incentive Report', icon: BarChart3, path: '/reports/incentive', roles: ['admin', 'management', 'hr_pms'] }`
- `src/pages/ManagementDashboard.tsx` — Add "Pending Incentive Adjustments" count widget

---

### Part 8: Implementation Order

1. Database migration — all 6 tables + RLS + `updated_at` triggers
2. Admin Config UI — Programs tab + Slabs tab + DQ Rules tab
3. Eligibility Data Entry tab — manual grid + Excel import/export
4. Hooks for CRUD operations
5. Edge function: `compute-monthly-incentives`
6. Monthly Incentive Report page
7. Edge function: `detect-retroactive-incentive-changes`
8. Retroactive Adjustment Report tab
9. Management Dashboard widget + sidebar/routing integration

---

### Key Design Principles

| Principle | Implementation |
|-----------|---------------|
| Zero Hardcoding | All slabs, thresholds, exemptions in DB tables — admin can revise anytime |
| Scoring Engine Alignment | 8-stage fallback chain + N/A exclusion, identical to dashboard |
| Frequency Awareness | Uses `getCycleMonths()` and `getActiveMonthForCycle()` for retroactive detection |
| Paginated Fetches | All KPI queries use `.range()` pagination to avoid 1000-row silent truncation |
| RLS + `has_role()` | All tables use existing security definer function |
| Lazy Routes | Pages loaded via `lazy(() => import(...))` |
| Sidebar Roles | Menu items use role arrays consistent with `ALL_APP_ROLES` |

