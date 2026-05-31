## RCA — Vivek Kumar Dansena (101784), AY 2025-26

### Confirmed facts (from DB)
1. **Inputs row exists and is correctly mapped** — `increment_inputs` for employee `ca3897d0…2926` / code 101784, AY `2025-26`: `absent_days=6, lwp_days=0, disciplinary_actions=0, training_compliance=0`. ✅
2. **Active approved ineligibility config** for AY 2025-26 is `4476ad81-1c17-43e8-b241-a4f31a494608` (status `approved`). It contains three active criteria:

| criterion_name | **criterion_key** | operator | threshold |
|---|---|---|---|
| Absent | `absent` | `>` | 0 |
| LWP | `lwp` | `>` | 8 |
| Discipline Action | `discipline_action` | `>` | 0 |

3. Vivek is **not** in `increment_eligibility_exclusions` (not criteria-exempt).
4. With `Absent > 0` and `absent_days = 6`, Vivek **must** be ineligible.

### Why the engine wrongly returned 20% eligible

In `supabase/functions/compute-increment/index.ts` (lines 520–547), the metrics map exposes ONLY the canonical keys:

```ts
const metrics = {
  absent_days: ..., lwp_days: ..., disciplinary_actions: ..., training_compliance: ...,
  ...(input.dynamic_metrics ?? {}),
};
for (const c of criteria) {
  const val = metrics[c.criterion_key];
  if (val === undefined || val === null) continue;   // ← silently skipped
  ...
}
```

The approved config's `criterion_key` values are `absent`, `lwp`, `discipline_action` — **not** the canonical `absent_days` / `lwp_days` / `disciplinary_actions`. So `metrics[c.criterion_key]` returns `undefined` for every criterion and the `continue` swallows them. No breach is recorded → engine treats Vivek as eligible → PMS score 4.6167 → slab 20% → 20% increment is persisted exactly as displayed.

### Why the keys are non-canonical

`IncrementEligibilitySection.tsx` (line 490) derives `criterion_key` by slugifying `criterion_name` (`"Absent" → "absent"`). The admin renamed the seeded "Absent Days" criterion to "Absent" (and similarly for the others), so the slug no longer matches the engine's hardcoded metric names. There is **no validation** preventing this drift, and the engine **fails silently** on unknown keys.

### Result persistence — no save/mapping bug
Persistence is correct given the (wrong) in-memory verdict: `eligibility_status='eligible'`, `eligible_percent=20`, `ineligibility_reason=null`, etc. UI and Excel are faithful to the run row — they're not the source of the defect.

---

## Correction Plan

### 1. Engine: resolve criterion_key against an alias table + log unknown keys
File: `supabase/functions/compute-increment/index.ts` (only the criteria-evaluation block, lines ~520-548).

- Build `metrics` as today, then add an **alias resolver** that maps common admin-edited keys to canonical metric keys:
  - `absent`, `absent_day`, `absence`, `absences` → `absent_days`
  - `lwp`, `leave_without_pay`, `lwp_day` → `lwp_days`
  - `discipline_action`, `disciplinary`, `disciplinary_action`, `discipline` → `disciplinary_actions`
  - `training`, `training_program`, `training_programs` → `training_compliance`
- Lookup order: `metrics[key]` → `metrics[aliases[key]]` → `dynamic_metrics[key]`.
- If still unresolved AND the criterion is active, push a synthetic reason `"Configuration error: criterion '<name>' not mapped to any input metric — contact admin"` and mark **ineligible** (fail-closed). This makes silent skips impossible going forward.
- This change is generic: any future criterion whose key matches a canonical metric or a known alias automatically participates as an ineligibility rule.

### 2. UI: stop free-form slugification, require a canonical metric binding
File: `src/components/admin/scoring/IncrementEligibilitySection.tsx` (Add/Edit dialog).

- Add a **"Metric"** dropdown bound to a typed enum: `absent_days | lwp_days | disciplinary_actions | training_compliance` (extensible via a small constants file `src/lib/incrementCriterionMetrics.ts`).
- `criterion_name` stays free-text (display only). `criterion_key` is set from the dropdown, not derived from the name.
- For existing rows the dropdown pre-selects the resolved canonical key (using the same alias map) so editing a legacy row auto-corrects it on save.
- Block save when no canonical metric is selected.

### 3. One-time data fix for the live approved config
Migration to normalize `increment_eligibility_criteria.criterion_key` for the three rows of config `4476ad81…`:
- `absent` → `absent_days`
- `lwp` → `lwp_days`
- `discipline_action` → `disciplinary_actions`

Scope: only rows where `criterion_key` is in the alias map AND `lower(criterion_key)` is not already canonical. Reversible (we keep the old value in audit via the standard updated_at trail; no destructive schema change).

### 4. Scope verification (no engine change required)
Today the engine selects `increment_eligibility_configs` by `assessment_year + status='approved'` only. Per existing policy, criteria configs are global per-AY (not scoped by company/division/BU/level for criteria themselves — scope filters apply to *exclusions*, not criteria). Confirmed in `evaluateIncrementEligibility` contract. **No change needed.** The original report's concern #3 (scope mismatch) is not the cause.

### 5. Tests (mandatory, in `supabase/functions/compute-increment/`)
New file `criteria_key_aliasing_test.ts`:
- alias `absent` resolves to `absent_days` and breaches when `actual=6 > threshold=0`.
- alias `discipline_action` resolves to `disciplinary_actions`; non-breach for actual=0, threshold=0 with `>` operator.
- unknown key `xyz` ⇒ synthetic `Configuration error` reason + ineligible.
- canonical key `absent_days` still works unchanged (regression guard).
- Mock data factories: `mockVivek` (absent=6) ⇒ ineligible; `mockClean` (all zero) ⇒ eligible.

Extend `criteria_exempt_test.ts` to assert exempt employee with alias `absent` still bypasses the block.

### 6. UI/Excel verification
- After re-running, Vivek's Run Details row should show `Eligibility = ineligible`, `Eligible % = —`, `Increment Amount = —`, `Revised Salary = —`, `Ineligibility Reason = "Absent > 0 (actual 6)"`.
- `IncrementInputs.tsx` already renders `ineligibility_reason` straight from the row — no change needed.
- Excel export reuses the same row shape — no change needed.

### 7. Docs & memory
- `DOCUMENTATION.md` → note the metric-binding contract.
- `POLICY.md` → "Criteria are global per AY; metric binding is enforced by canonical key."
- `mem/features/admin/increment-eligibility-exclusions` → add: "criterion_key MUST be canonical or a known alias; UI binds via dropdown".
- New ADR-070 documenting the alias resolver + fail-closed behavior.

### Risk & Impact
- **Data**: 3 rows updated in `increment_eligibility_criteria` (live config). Reversible.
- **Workflow**: Future runs honor active criteria correctly. Past `increment_run_items` rows are NOT rewritten (per constraint).
- **UI**: Add/Edit dialog gains one dropdown; existing rows pre-fill. Non-breaking.
- **Regression**: Fail-closed unknown-key path could newly flag misconfigured rows as ineligible — desired behavior; surfaced explicitly in the reason column so admins can correct.
- **Scalability**: Pure in-loop alias lookup, O(1) per criterion; no extra DB calls.
- **Rollback**: Revert the edge-function file and the UI file; migration revert maps canonical → old text if ever required.

### Acceptance check after build
1. Re-run AY 2025-26 → Vivek 101784: `ineligible`, reason mentions Absent breach, eligible % = 0, increment = 0.
2. An employee with `absent_days=0, lwp_days=0, disciplinary_actions=0, training_compliance=0` stays eligible.
3. A criteria-exempt employee with `absent_days=99` stays eligible (block bypassed).
4. UI table and Excel export reflect the same `eligibility_status`, `eligible_percent`, `ineligibility_reason`.
