## Goal

Allow admins to exclude specific employees (e.g. senior staff / board members) from the **Increment Eligibility Criteria** for a **specific Assessment Year only** — never globally across years. Excluded employees bypass criteria evaluation for that AY and are treated as eligible by default.

**Per-AY rule (locked):** an exclusion is valid only for the `assessment_year` it was created against. The same employee can be excluded in 2025-26 and still fully evaluated in 2026-27, 2024-25, etc.

## Risk & Impact

- **Data**: New table `increment_eligibility_exclusions` — additive, no breaking change.
- **Workflow**: Evaluator short-circuits only when `(employee_id, assessment_year)` exists in exclusion set. No cross-year leakage.
- **UI/UX**: New "Excluded Employees" card on the same `IncrementEligibilitySection` page, below the Criteria table.
- **Regression**: Low — existing criteria flow untouched.
- **RLS / Audit**: Mirrors `increment_eligibility_configs` (Admin + HR PMS), audit rows written to existing `increment_eligibility_audit`.
- **Backup**: Auto-covered via `get_backup_table_order()`.

## UI Design (added to the same page)

Placement: directly under the existing **Criteria** card, above Version History / Audit Trail.

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│  🛡  Excluded Employees — Assessment Year: 2025-26    [+ Add Exclusion]      │
│  These employees bypass all Increment Eligibility Criteria for                │
│  Assessment Year 2025-26 only. They remain governed by criteria in            │
│  every other Assessment Year. Changes are audited.                            │
│                                                                              │
│  ┌─ Add Exclusion (inline panel) ──────────────────────────────────────────┐│
│  │  Employees *      [🔍 Search by name / code / dept … ▼ multi-select]    ││
│  │                   chips → [Ravi K · EMP102 ✕] [Priya · EMP044 ✕]        ││
│  │  Assessment Year *[ 2025-26 ▼ ] (defaults to loaded AY)                 ││
│  │  Reason            [ short text – optional, e.g. "Board member" ]       ││
│  │                                       [Cancel]  [Add N Employees]       ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌────────┬───────────────┬─────────────┬────────────┬─────────┬──────────┐ │
│  │ Code   │ Name          │ Department  │ Assessment │ Reason  │ Added On │ │
│  │        │               │             │   Year     │         │          │ │
│  ├────────┼───────────────┼─────────────┼────────────┼─────────┼──────────┤ │
│  │ EMP102 │ Ravi Kumar    │ Operations  │  2025-26   │ Board…  │ 30 May 🗑│ │
│  │ EMP044 │ Priya Sharma  │ Finance     │  2025-26   │ —       │ 28 May 🗑│ │
│  └────────┴───────────────┴─────────────┴────────────┴─────────┴──────────┘ │
│  Total excluded for 2025-26: 2                                               │
│                                                                              │
│  [ ] Show exclusions for all Assessment Years (read-only view)               │
└──────────────────────────────────────────────────────────────────────────────┘
```

Interaction:
- **Default view** is filtered to the AY currently loaded in the scope filter — making the per-AY scoping visually obvious. The header bar shows "Assessment Year: 2025-26" and the helper text repeats the rule in plain English.
- **Employee picker**: shadcn `Command` + `Popover` powered by `useActiveEmployeesForCopy`. Multi-select chips, searchable by name / employee code / department.
- **Assessment Year selector**: prefilled with the loaded AY; admin may pick another AY only to manage exclusions for a *different specific year* — never "all years". There is no "apply to all years" option by design.
- **Add**: single bulk insert; all chips share the chosen AY + reason. Re-adding the same `(employee, AY)` is blocked by a DB UNIQUE constraint; UI surfaces a toast like `"3 added · 1 already excluded for 2025-26"`.
- **Remove**: per-row trash → `ConfirmDestructiveDialog` → delete + audit `exclusion_removed`. Removal affects only that one AY row.
- **"Show all years"** toggle: reveals every AY's exclusions for this config scope, **read-only** (Add/Remove disabled in that view) to prevent accidental cross-year edits.
- **Read-only when config is `approved`**: Add/Remove hidden, banner explains recall is required (parity with criteria edit rules).
- **Empty state**: "No exclusions for 2025-26. All employees in this scope are governed by the criteria above for this Assessment Year."
- **Responsive**: table collapses to stacked cards under `sm`.

No other UI on the page changes.

## Technical Steps

1. **DB migration — `increment_eligibility_exclusions`**
   - Columns:
     - `id uuid pk default gen_random_uuid()`
     - `config_id uuid not null fk → increment_eligibility_configs(id) ON DELETE CASCADE`
     - `employee_id uuid not null` (references `profiles.id`, no FK to `auth`)
     - `assessment_year text not null` *(the AY the exclusion is valid for — NOT inherited across years)*
     - `reason text null`
     - `added_by uuid null`
     - `added_at timestamptz not null default now()`
   - `UNIQUE (config_id, employee_id, assessment_year)` — guarantees per-AY uniqueness; same employee can have separate rows for different AYs.
   - Indexes: `(config_id, assessment_year)`, `(employee_id, assessment_year)`
   - GRANTs: `authenticated`, `service_role` (no `anon`)
   - RLS: SELECT / INSERT / DELETE for `admin` or `hr_pms`
   - Trigger → `increment_eligibility_audit` rows with `action = 'exclusion_added' | 'exclusion_removed'`, `revised_value` jsonb capturing `{ employee_id, employee_name, employee_code, assessment_year, reason }`.

2. **Hook layer — `src/hooks/useIncrementEligibility.ts`**
   - `useEligibilityExclusions(configId, assessmentYear?)` — when `assessmentYear` provided, filter `.eq('assessment_year', …)`; otherwise return all (used by "Show all years"). Joined with `profiles(full_name, employee_code, departments(name))`.
   - `useAddEligibilityExclusions()` — bulk insert `{ config_id, employee_ids[], assessment_year, reason? }`. Uses `.upsert(..., { ignoreDuplicates: true })` so duplicates are silently skipped; mutation returns inserted-vs-skipped counts for the toast.
   - `useRemoveEligibilityExclusion()` — delete by `id` only (single-AY row).
   - Invalidate `['increment-eligibility-exclusions', configId]` + audit key.

3. **Evaluator — `src/lib/incrementEligibility.ts`**
   - Extend `evaluateIncrementEligibility` with optional params:
     ```ts
     employeeId?: string;
     assessmentYear?: string;
     exclusions?: Set<string>; // key = `${employeeId}|${assessmentYear}`
     ```
   - Exclusion fires **only** when `employeeId && assessmentYear && exclusions.has(`${employeeId}|${assessmentYear}`)` → returns `{ eligible: true, failed: [], excluded: true, exclusion_reason }`.
   - Same employee evaluated against a *different* AY runs the normal criteria pipeline.
   - Back-compatible — all new params optional.

4. **UI — `src/components/admin/scoring/IncrementEligibilitySection.tsx`**
   - New sub-component `ExclusionsCard({ configId, defaultAssessmentYear, knownYears, readOnly })`.
   - Inline "Add Exclusion" panel: employee combobox + AY select (prefilled, single AY) + optional reason + bulk Add button.
   - Table with AY column + per-row delete confirm.
   - Header chip showing the active AY filter; "Show all years (read-only)" toggle.
   - Rendered right after the existing Criteria card.

5. **Tests (mandatory)**
   - `src/lib/incrementEligibility.test.ts`:
     - excluded `(employee, 2025-26)` returns `eligible: true` even when criteria breach for 2025-26.
     - same employee NOT excluded for `(employee, 2026-27)` → still evaluates normally and can fail.
     - missing `assessmentYear` param → exclusion never fires (defensive).
   - `src/hooks/useIncrementEligibility.test.ts`:
     - add mutation payload includes `assessment_year` and is sent per chip.
     - duplicate-AY add is ignored, not erroring.

6. **Docs / Policy / Memory**
   - `DOCUMENTATION.md` → "Increment Eligibility → Excluded Employees" subsection (schema + UI flow + per-AY scoping rule).
   - `POLICY.md` → "An exclusion row in `increment_eligibility_exclusions` bypasses Increment Eligibility Criteria **only** for the specific `assessment_year` recorded on that row. Exclusions never apply across Assessment Years. Adding an employee for a new AY requires a new exclusion row. Exclusions are auditable and editable only while the config is not `approved`."
   - Add `mem://features/admin/increment-eligibility-exclusions` memory note + index entry, with rule: *"Exclusions are per `(config, employee, assessment_year)` — never cross-year."*

## Rollback

Drop `increment_eligibility_exclusions` + revert hook/component. No mutation of existing tables.

## Out of Scope

- CSV bulk import of exclusions.
- "Apply to all years" / multi-year exclusion shortcuts (explicitly rejected by the per-AY rule).
- Time-bounded sub-AY windows (start/end dates).
- Auto-cascade of an exclusion across multiple scopes/configs.
