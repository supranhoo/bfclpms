
## Plan: Detailed RCA + Structural Fix for “Compute Now still returns 0”

### What I found in the current code
I reviewed the current frontend scope/filter flow and the deployed `compute-monthly-incentives` function. The earlier “Full Month shadowing” fix is present, but there is still a second structural mismatch.

### Detailed RCA
1. **The backend still decides “production vs non-production” from `program.program_type` only**
   - In `supabase/functions/compute-monthly-incentives/index.ts`, the split-period path runs only when:
     - `program.program_type === 'production'`
     - and `prodDailyMap.has(emp.id)`
   - If a programme uses production daily entries/rates in practice but is not classified exactly as `program_type = 'production'`, the function does **not** go through the canonical sub-period branch.

2. **That means the period filter can still wipe out valid data**
   - The UI sends `scope.payment_period = '1-10'` for filtered compute.
   - Non-production branches still emit `payment_period: 'Full Month'`.
   - Then the backend applies:
     - `scopedRecords = records.filter(r => r.payment_period === scopePaymentPeriod)`
   - Result: valid programme data can still end at **0 records** if the programme is being computed through the wrong branch.

3. **This explains why the issue persisted even after the canonical sub-period fix**
   - That fix only helps programmes that actually enter the `program_type === 'production'` path.
   - If “Metal Sizing” is configured in a different mode but still relies on daily production inputs, the bug remains.

4. **There is also a backend company/rate mismatch**
   - Slab scope matching now uses:
     - direct `profiles.company_id`
     - or hierarchy fallback
   - But production rate resolution still uses:
     - department -> BU -> company chain only
   - So the same employee can be:
     - included in UI company scope
     - eligible for slab matching
     - but resolved inconsistently for company-based rate lookup
   - This is not the only cause of “0”, but it is a real logic divergence in the same compute path.

5. **The UI still shows a mapping count, not a compute-ready count**
   - `filteredMappedCount` is based on programme mappings + company filter.
   - It does not prove:
     - daily production rows exist
     - positive values exist in selected sub-period
     - a rate resolves
     - the programme is being computed in the correct backend mode

6. **Documentation/policy are out of sync with live code**
   - `POLICY.md` still says all-3-range production data becomes one stored `Full Month` record.
   - Current edge function already moved to canonical sub-period storage.
   - This mismatch makes future fixes easier to apply incorrectly.

---

## Fix approach

### 1) Make compute mode explicit and authoritative
**Files likely touched**
- `supabase/functions/compute-monthly-incentives/index.ts`
- programme config UI/hooks
- possibly database migration if no explicit field exists

**Change**
Replace implicit compute branching from `program_type` alone with an authoritative programme mode.

Preferred durable approach:
- add a DB-backed mode on programmes, e.g.
  - `support`
  - `production_daily`
  - `production_target`
  - `vessel_fixed`

If a suitable field already exists, reuse it instead of adding one.

**Why**
The current bug is caused by configuration meaning one thing in the UI/data-entry layer and another thing in the compute engine.

---

### 2) Refactor the edge function to branch by compute mode, not assumption
**File**
- `supabase/functions/compute-monthly-incentives/index.ts`

**Change**
- `production_daily` mode:
  - always emit canonical `1-10`, `11-20`, `21-31` rows
  - apply sub-period scope only to these rows
- `support`, `vessel_fixed`, `production_target` modes:
  - do not pretend sub-period scoping applies unless the mode actually supports it
  - if the user selected `1-10/11-20/21-31` for a non-split mode, return a clear diagnostic instead of silently producing 0

**Why**
This removes the remaining path where filtered compute can still zero out valid data.

---

### 3) Unify company resolution across slab matching and production rate lookup
**File**
- `supabase/functions/compute-monthly-incentives/index.ts`

**Change**
Use the same company resolver everywhere:
- prefer `profiles.company_id`
- fallback to dept -> BU -> division -> company chain

Apply this in:
- slab matching
- company-scoped production rate cascade

**Why**
Employees currently can match company scope in one part of the compute logic and miss it in another.

---

### 4) Return real diagnostics from the backend
**Files**
- `supabase/functions/compute-monthly-incentives/index.ts`
- `src/hooks/useIncentiveRecords.ts`
- `src/components/incentive/IncentiveDryRunDialog.tsx`

**Add diagnostics such as**
- `detected_compute_mode`
- `employees_in_scope`
- `employees_with_daily_entries`
- `employees_with_positive_selected_period_data`
- `employees_with_resolved_rate`
- `employees_skipped_no_rate`
- `employees_skipped_mode_mismatch`
- `records_pre_scope`
- `records_post_scope`

**Why**
Right now “0 processed” is too shallow to distinguish:
- wrong compute branch
- no sub-period data
- no resolved rate
- no matching employees

---

### 5) Make the report UI mode-aware
**File**
- `src/components/incentive/MonthlyIncentiveTable.tsx`

**Change**
- Only allow / emphasize `1-10`, `11-20`, `21-31` compute scoping for programmes that truly support split-period compute
- For non-split programmes:
  - disable sub-period compute
  - or show helper text that the selected programme computes only as full-period
- Replace empty-state mapping count with:
  - mapped employees
  - compute-ready employees
  - backend-detected mode

**Why**
The UI currently implies filtered compute is valid for every programme shape.

---

### 6) Sync SSOT docs and policy
**Files**
- `DOCUMENTATION.md`
- `POLICY.md`
- `docs/adr/ADR-044.md`

**Update**
- canonical production storage is sub-period based
- `Full Month` is a derived reporting view for production-daily mode
- programme compute behavior is mode-driven
- sub-period filters only apply to split-period modes
- version history updated

---

### 7) Regression protection
**Tests to add**
- programme with daily entries but wrong/legacy type classification -> explicit mode resolves correct compute path
- `production_daily` + `1-10` scope -> writes expected rows
- non-split mode + `1-10` scope -> returns clear diagnostic, not misleading zero
- direct `profiles.company_id` company-based rate resolution works
- derived `Full Month` UI view still aggregates split rows correctly

**Likely files**
- `supabase/functions/compute-monthly-incentives/*_test.ts`
- frontend test for mode-aware period filter behavior
- updated mock programme fixtures

---

## Risk & Impact Report
| Area | Impact |
|---|---|
| Data impact | Medium if an explicit programme mode field is added; existing programmes may need backfill/mapping |
| Workflow impact | Medium; compute behavior becomes stricter and clearer per programme mode |
| UI/UX consistency | Improved; period filters will match what each programme can actually compute |
| Regression risk | Medium; touches the core compute branch selector |
| Mitigation plan | Add edge-function tests, fixture coverage for legacy programmes, and documentation/policy sync in the same change |

## Likely deliverables
- backend compute-mode refactor
- unified company/rate resolver
- richer diagnostics surfaced in UI
- mode-aware compute controls in Incentive Report
- tests + mock data
- `DOCUMENTATION.md` + `POLICY.md` + ADR update

## Out of scope
- Reworking unrelated non-incentive workflows
- Changing payroll confirmation flow
- Retroactive adjustment logic unless it depends on the same compute-mode branch
