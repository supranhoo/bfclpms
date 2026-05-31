
# Plan — Annual Score & Increment Management (Revised v2)

Two modules: **(A) Config layer** under System Settings, and **(B) Execution layer** as standalone sidebar items + new Increment menu group.

## Approved Decisions

- **Eligibility model:** Criteria (existing) act as hard gate → if eligible, new Method (Full / Prorated DOJ / Custom service-slab) decides % of slab applied.
- **Annual score:** Compute on-demand; snapshot to table on each Calculate run.
- **Custom months:** Fiscal month checkboxes (project fiscal = **July–June**).
- **Scope overlap:** *Most specific wins*.
- **Reuse:** Existing `useIncrementEligibility.ts` + `incrementEligibility.ts` extended, not rebuilt.

## Revised Menu Placement

```text
Sidebar
├── Incentive
│   ├── Incentive Data Entry              (existing — unchanged)
│   │     Tabs: Production Data | Eligibility Data
│   │
│   └── Increment Inputs                  ← NEW sidebar item (below Data Entry)
│         Tabs: Enter Inputs | Calculate Increment %    ← B4 nested sub-tab
│
├── Increment                              ← NEW menu group
│   ├── General Eligibility                (B1)
│   └── Increment Slabs                    (B2)
│
└── System Settings
    ├── Scoring › Annual Score Calculation (A1) ← NEW
    └── Increment › Eligibility Criteria    (existing, +Copy Prev Year)
        › Increment Method                  (A3) ← NEW
```

Incentive Data Entry stays untouched. The new **Increment Inputs** sidebar item is its own page with two tabs.

## Risk & Impact

| Area | Impact | Mitigation |
|------|--------|------------|
| Data | 4 new tables, additive only. Auto-backed-up. | Drop-table rollback. |
| Workflow | Read-only on PMS `final_score`. | Respect N/A + immutability. |
| RLS | Admin/HR PMS full; Employee SELECT own run_item only. | `has_role()` policies. |
| UI/UX | 1 new sidebar item under Incentive, 1 new sidebar group (Increment), 3 new SystemSettings sub-tabs. No change to existing Incentive Data Entry. | Reuses shadcn Tabs + `OrgFilterCombobox`. |
| Regression | Existing pages untouched apart from SystemSettings additions. | Hook contracts unchanged. |
| Scalability | Calc edge fn batched 250/page; Inputs grid server-paginated 50/100/200. | Bounded queries. |

## A. System Settings — Configuration Layer

### A1. Annual Score Calculation

```text
┌─ System Settings › Scoring › Annual Score Calculation ──────────────┐
│ [Company ▾] [Division ▾] [BU ▾] [Category ▾] [Level ▾] [Loc ▾]      │
│ [Assessment Year ▾]                          [Copy Prev Year] [Save]│
├─────────────────────────────────────────────────────────────────────┤
│ Method (one active per scope+AY):                                   │
│   ( ) Average of All Monthly Scores                                 │
│   ( ) Last 6 Months Average                                         │
│   (•) Custom Month Selection                                        │
│       ☑ Jul ☑ Aug ☑ Sep ☐ Oct ☐ Nov ☐ Dec                           │
│       ☑ Jan ☑ Feb ☑ Mar ☐ Apr ☐ May ☐ Jun                           │
├─────────────────────────────────────────────────────────────────────┤
│ Version History  [v3 · current]  [v2]  [v1]                         │
└─────────────────────────────────────────────────────────────────────┘
```

### A2. Increment Eligibility Criteria — extend existing

Add "Copy Previous Year" button + surface `criterion_key` so HR can add criteria without code.

### A3. Increment Method

```text
┌─ System Settings › Increment › Increment Method ────────────────────┐
│ [Company ▾] [Division ▾] [BU ▾] [Category ▾] [Level ▾] [Loc ▾]      │
│ [Assessment Year ▾]                          [Copy Prev Year] [Save]│
├─────────────────────────────────────────────────────────────────────┤
│ Method:                                                             │
│   (•) Full Increment                                                │
│   ( ) Prorated by DOJ   (% ÷ 12) × Months Served                    │
│   ( ) Custom Service-Period Slabs                                   │
│       ┌──────────┬──────────┬───────┐                               │
│       │From (mo) │To (mo)   │% of   │                               │
│       │   0      │   3      │  0%   │ [✕]                           │
│       │  >3      │   6      │ 50%   │ [✕]                           │
│       │  >6      │   9      │ 75%   │ [✕]                           │
│       │  >9      │   —      │100%   │ [✕]                           │
│       └──────────┴──────────┴───────┘ [+ Add Slab]                  │
└─────────────────────────────────────────────────────────────────────┘
```

Validation: slabs non-overlapping, cover 0→∞, % in 0–100.

## B. Execution Layer

### B1. Increment › General Eligibility (sidebar card under Increment group)

```text
┌─ Increment › General Eligibility ───────────────────────────────────┐
│ Assessment Year: [2025-26 ▾]            [Copy Prev Year]   [Save]   │
├─────────────────────────────────────────────────────────────────────┤
│ Employee Categories ▾  [Sales × Ops × Plant ×]                      │
│ Employment Status   ▾  [Confirmed × Probation ×]                    │
│ Levels              ▾  [M2 × M3 × M4 ×]                             │
│ Minimum Service:       [ 6 ] months                                 │
├─────────────────────────────────────────────────────────────────────┤
│ Preview: 412 employees eligible · 38 excluded                       │
└─────────────────────────────────────────────────────────────────────┘
```

`profiles.employment_status` already exists — no schema change here.

### B2. Increment › Increment Slabs (sidebar page under Increment group)

```text
┌─ Increment › Increment Slabs ───────────────────────────────────────┐
│ AY [2025-26 ▾]  Increment Period [Jul 25–Jun 26 ▾]                  │
│ [Copy Previous Year] [+ Add Row] [+ Add Criteria Column] [Save]     │
├──────────┬───────┬─────┬─────┬────┬────┬──────┬─────┬──────────────┤
│ Rating   │ Incr% │ Co. │ Div │ BU │ Loc│ Cat  │ Lvl │ Prorate DOJ  │
│ 4.75+    │  12%  │ ALL │ ALL │ALL │ALL │ ALL  │ ALL │  ☑           │
│ 4.50-4.74│  10%  │ ALL │ ALL │ALL │ALL │ ALL  │ ALL │  ☑           │
│ 3.00-4.49│   8%  │ ALL │ ALL │ALL │ALL │ ALL  │ ALL │  ☑           │
│ 2.10-2.99│   5%  │ ALL │ ALL │ALL │ALL │ ALL  │ ALL │  ☐           │
│ 1.01-2.00│   2%  │ ALL │ ALL │ALL │ALL │ ALL  │ ALL │  ☐           │
│ 0.00-1.00│   0%  │ ALL │ ALL │ALL │ALL │ ALL  │ ALL │  ☐           │
└──────────┴───────┴─────┴─────┴────┴────┴──────┴─────┴──────────────┘
 [Save Draft] [Submit]    Version History › v1 · v2 (current)
```

### B3. Incentive › Increment Inputs (NEW standalone sidebar item below Incentive Data Entry)

New page at `src/pages/incentive/IncrementInputs.tsx`. Two tabs inside the page:

```text
┌─ Incentive › Increment Inputs ──────────────────────────────────────┐
│ Tabs: [ Enter Inputs ● ] [ Calculate Increment % ]                  │
├─────────────────────────────────────────────────────────────────────│
│ ── Enter Inputs ────────────────────────────────────────────────────│
│ Filters: AY [..] Co [..] Status [Active] Div BU Cat Lvl Loc         │
│ [Import Excel] [Bulk Update] [Manual Entry] [Template]              │
├─────────────────────────────────────────────────────────────────────│
│ Co │ Code │ Name │ Desg │ Dept │ Lvl │ Abs │ LWP │ Disc │ Trng │ 5S│
│ ─  │ E001 │ ...  │ ...  │ ...  │ M3  │  2  │  0  │  0   │  4   │ ✓ │
│ ...                                                                  │
│                                       [‹ 1 2 … 24 ›] 50 / page      │
└─────────────────────────────────────────────────────────────────────┘
```

- Input columns are dynamic: any `criterion_key` from System Settings A2 auto-appears as a numeric column.
- Excel import via existing import-engine pattern (idempotent, dedup per employee+AY).
- Server-side pagination.

### B4. Calculate Increment % (second tab on the same Increment Inputs page)

```text
┌─ Incentive › Increment Inputs › Calculate Increment % ──────────────┐
│ Filters: AY Co Div BU Cat Lvl Loc                                   │
│                            [Dry Run]  [Calculate Increment %]       │
├─────────────────────────────────────────────────────────────────────│
│ Code│Name│Dept│Desg│Lvl│PMS Score│Band│Slab%│Method│Elig %│Amount   │
│     │    │    │    │   │         │    │     │      │      │Curr→Rev │
│     │    │    │    │   │         │    │     │      │      │Status   │
│     │    │    │    │   │         │    │     │      │      │Reason   │
├─────────────────────────────────────────────────────────────────────│
│   [Export Excel] [Export PDF]   Run history › runs/2026-04-12 ...   │
└─────────────────────────────────────────────────────────────────────┘
```

Computation flow (edge fn `compute-increment`, batched 250):

```text
For each employee in scope:
  1. General Eligibility gate (B1)
        fail → Not Eligible, reason="General eligibility"
  2. Criteria gate (existing evaluateIncrementEligibility, reads B3 inputs)
        fail → Not Eligible, reason=failed criterion names
  3. AnnualScore = resolveMethod(scope, AY) over monthly final_scores
        (exclude N/A and nulls, fiscal Jul–Jun)
  4. Match rating band → slab% (B2)
  5. Apply Method (Full | Prorated DOJ | Custom service-slab) (A3)
        EffectiveMonths = min(12, monthsBetween(DOJ, AYStart..AYEnd))
  6. IncrementAmount = CurrentSalary × Eligible%
  7. Upsert into increment_runs / increment_run_items
```

## Technical Details

### New DB tables (additive, auto-backed-up)

```sql
-- A1
annual_score_configs(id, scope_*, assessment_year,
  method enum('avg_all','last_6','custom'), custom_months int[],
  version, status, created_by, created_at)
annual_score_config_audit(id, config_id, action, prev jsonb, new jsonb,
  performed_by, performed_at)

-- A3
increment_method_configs(id, scope_*, assessment_year,
  method enum('full','prorated_doj','custom'), version, status, created_by, created_at)
increment_method_slabs(id, method_config_id, from_months numeric,
  to_months numeric NULL, percent_of_slab numeric, sort_order)

-- B1
general_eligibility_configs(id, assessment_year, category_ids[],
  employment_statuses text[], level_ids[], min_service_months int,
  version, created_by, created_at)

-- B2
increment_slabs(id, assessment_year, increment_period,
  rating_from numeric, rating_to numeric, increment_percent numeric,
  prorate_on_doj boolean, scope_*, extra_attributes jsonb,
  version, status, created_by)

-- B3
increment_inputs(id, assessment_year, employee_id, absent_days,
  lwp_days, disciplinary_actions, training_compliance,
  dynamic_metrics jsonb, source enum('manual','import','bulk'),
  updated_by, updated_at, UNIQUE(employee_id, assessment_year))

-- B4
increment_runs(id, assessment_year, scope_snapshot jsonb,
  triggered_by, triggered_at, status, summary jsonb)
increment_run_items(id, run_id, employee_id, pms_score, rating_band,
  slab_percent, eligibility_status, ineligibility_reason text,
  method_used, eligible_percent, current_salary, revised_salary,
  increment_amount, remarks)
```

GRANT to `authenticated` + `service_role`; RLS — Admin/HR PMS full; Employee SELECT own `increment_run_items` only.

### Hooks / Services
- `useAnnualScoreConfig`, `useIncrementMethod`, `useGeneralEligibility`,
  `useIncrementSlabs`, `useIncrementInputs` (server pagination), `useIncrementRuns`
- Pure: `src/lib/annualScoreResolver.ts`, `src/lib/incrementMethodApplier.ts`

### Edge Functions
- `compute-increment` (admin/hr_pms only, batched 250, idempotent per run_id)
- `import-increment-inputs` (Excel parse + validation)

### Pages / Routes
- Extend `src/pages/admin/SystemSettings.tsx` — Scoring › Annual Score; Increment › Method.
- New: `src/pages/incentive/IncrementInputs.tsx` (2 tabs: Enter Inputs, Calculate Increment %).
- New: `src/pages/increment/GeneralEligibility.tsx`, `src/pages/increment/IncrementSlabs.tsx`.
- Sidebar: under existing **Incentive** group add second item "Increment Inputs"; add new **Increment** group with "General Eligibility" + "Increment Slabs". Visible to Admin + HR PMS via menu access.

### Tests (mandatory)
- `annualScoreResolver.test.ts` — all 3 methods, N/A exclusion, missing months.
- `incrementMethodApplier.test.ts` — Full / Prorated DOJ / Custom slab boundaries.
- Extend `incrementEligibility.test.ts` for combined gate.
- Edge fn fixture: 10 mock employees covering all paths.

### Docs / Memory
- `DOCUMENTATION.md` — new "Increment Module" section + sidebar layout.
- `POLICY.md` — annual score methods, gate order, prorate formula.
- `mem://features/admin/annual-score-and-increment-engine` — new memory.

## Rollout Phases

1. **Phase 1** — DB migration + SystemSettings A1/A3 UI + extend A2 (Copy Prev Year).
2. **Phase 2** — Increment sidebar group: General Eligibility (B1) + Increment Slabs (B2).
3. **Phase 3** — Incentive › Increment Inputs page (B3) — Enter Inputs tab with manual + Excel import.
4. **Phase 4** — Increment Inputs › Calculate Increment % tab (B4) + edge fn + exports.
5. **Phase 5** — Audit history viewers + version diff.

Each phase additive + reversible.

---

**Ready to start Phase 1** on approval.
