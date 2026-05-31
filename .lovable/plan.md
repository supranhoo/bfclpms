# Calculate Increment % — Scope (All / Single Employee) + Pagination + Export

## Assumptions
- Single-employee runs must not touch other employees' rows. Easiest contract: edge function filters `profiles` and `inputs` by `employee_id`, inserts a normal `increment_runs` row with `scope_snapshot.scope = 'single'` and `scope_snapshot.employee_id`. No other employees' run-items are written, so existing all-employee runs remain intact.
- `increment_runs.scope_snapshot` is JSONB and already accepts arbitrary keys — **no DB migration needed**.
- Run items always belong to a single run (`run_id`), so a single-employee run is naturally isolated.
- Reuse existing `EmployeeCombobox` (single-select) + `useActiveEmployeesForCopy` (paged active roster).
- Calculation formulas, eligibility logic, slabs, confirmation-increment adjuster, and salary math stay untouched.

## Clarifications
None blocking — single-emp scope stored in `scope_snapshot`, distinction shown in the runs table from that field.

## Risk & Impact Report
- **Data:** No schema change. `scope_snapshot` already JSONB. New runs simply carry `{scope, employee_id}`. Historical runs render as "All employees" (default).
- **Workflow:** Additive. Existing "Run Calculation" for all employees keeps working when scope = All.
- **UI/UX:** New scope toggle + conditional employee picker in the Calculate tab header. No change to Enter Inputs tab. Run details table gains pagination + full-run export.
- **Permissions/RLS:** Unchanged. Edge function still gates on `admin`/`hr_pms`.
- **Regression risk:** Low — edge fn change is a narrow filter applied to the `profiles` query (and skipping `prevAdj`/`inputs` filters by employee in-memory). Add a guard so empty `employee_id` falls back to all-employees.
- **Scalability:** Run items already paginated server-side via `useIncrementRunItems`. Export-all uses a paged fetch (`fetchAllPaged`) capped to the run's items only.

## Step-by-step Plan

### 1. `supabase/functions/compute-increment/index.ts` — accept optional `employee_id`
- Extend `RunBody`: `{ assessment_year: string; employee_id?: string | null }`.
- Validate: if provided, must be UUID.
- When set:
  - Add `.eq('id', employee_id)` to the `profiles` query.
  - Persist on the run: `scope_snapshot: { triggered_by, scope: 'single', employee_id }`. Otherwise `{ triggered_by, scope: 'all' }`.
- Everything downstream iterates `for (const p of profiles)` — already isolated. No other employees' run-items are written.
- Verification: run with `employee_id` → `increment_run_items` for that run contains exactly one row; existing runs unaffected.

### 2. `src/hooks/useIncrementRuns.ts`
- `useTriggerIncrementRun.mutationFn` accepts `{ assessment_year, employee_id? }` and forwards both in `functions.invoke('compute-increment', { body })`.
- Add paginated items hook param signature already present (`page`, `pageSize`). No change needed there.
- Add a new helper `useExportIncrementRunItems(runId)` (lazy, on-demand) that uses `fetchAllPaged` against `increment_run_items` with the same select used by `useIncrementRunItems` — for "Export all rows of run" regardless of current page.

### 3. `src/pages/incentive/IncrementInputs.tsx` — `CalculateIncrementTab`
UI changes in the existing Card header:
- **Scope selector** (Select): `All Employees` (default) | `Single Employee`.
- When `Single Employee`: render `EmployeeCombobox` (single-select, sourced from `useActiveEmployeesForCopy`).
- **Run Calculation** button: disabled while `trigger.isPending`, AND when scope=single but no employee chosen.
- On click → `trigger.mutate({ assessment_year: year, employee_id: scope === 'single' ? selectedEmpId : undefined })`.
- After success → auto-select the new run id (use `onSuccess` data to set `selectedRun`).

Runs table:
- Add a **Scope** column reading `r.scope_snapshot?.scope` → render `All` or `Single · <name/code>` (resolve from employees map; fall back to UUID).
- Keep existing Status/Summary/View.

Run details table (already exists):
- **Add pagination** (page/setPage state, pageSize=50). Wire to `useIncrementRunItems(selectedRun, page, 50)` and render Prev/Next with total count — matches the pattern already in `EnterInputsTab`.
- **Export Excel** button:
  - Uses `useExportIncrementRunItems(selectedRun)` (lazy fetch on click via `refetch`) so it always exports the **entire run**, not just the visible page.
  - Filename: `increment-run-{YYYYMMDD-HHmm}{-single-<code>}.xlsx`.
- Reset `page` to 0 when `selectedRun` changes.

Empty state:
- Update copy to: *"No runs yet. Choose calculation scope and click 'Run Calculation' to start."*

### 4. Toasts
Already provided by `useTriggerIncrementRun` (success/failure). Add a "Calculation queued for <employee>" description on single-emp runs.

## UI Changes
- **Location:** Increment Inputs → "Calculate Increment %" tab → top Card header.
- **What's new visually:**
  1. A `Scope` Select (~180px) left of the existing Run Calculation button.
  2. When scope = Single Employee, an `EmployeeCombobox` appears inline (header wraps to a 2-row flex on narrow widths).
  3. Runs table gains one column: **Scope**.
  4. Run Details card gains a pagination footer (Prev / Page X of Y / Next) and the existing Export Excel button now exports the full run.
- **Interaction:** Run button stays disabled until employee is picked in single mode. Switching scope clears the picker.
- **Responsiveness:** Header uses `flex flex-wrap gap-2`; combobox is `w-full sm:w-[320px]`.

## Out of Scope
- No change to Enter Inputs tab.
- No change to formulas, eligibility, slabs, salary, confirmation adjuster.
- No schema migration (uses existing `scope_snapshot` JSONB).
- No permission/route changes.

## Tests
- **Unit (`__tests__/computeIncrementBody.test.ts`):** body validator accepts/rejects `employee_id` UUID; falls back to all when omitted.
- **Component (`IncrementInputs.calculate.test.tsx`):**
  - Default scope = All → Run enabled, payload omits `employee_id`.
  - Switch to Single → Run disabled until employee chosen.
  - After Single run, runs row shows "Single · <name>".
  - Pagination Prev/Next change page param.
  - Export click invokes paged fetch (mock) and writes XLSX with all rows.
- **Manual QA:** Trigger Single run for emp A → only 1 row in items; trigger All run → unaffected; old runs render as "All".

## Documentation / Policy Updates
- `DOCUMENTATION.md` → Increment section: document `compute-increment` new optional `employee_id`, scope persistence in `scope_snapshot`, and UI scope toggle.
- `POLICY.md` → Increment Calculation: "HR/Admin may run the calculation for the full eligible roster or for a single employee for testing/spot-check. Single-employee runs are isolated to that employee and do not modify other employees' results." Add to Version History.

## Post-Implementation Notes
- Historical runs (pre-change) have no `scope` key → UI defaults their label to "All".
- Edge fn keeps its admin/hr_pms gate; no RLS changes required.
