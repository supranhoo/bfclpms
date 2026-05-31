## 1. RCA — How the system "identifies" a Trainee → Confirmed transition today

### Where status lives

`public.profiles` columns (verified):

| Column | Purpose | Populated? |
|---|---|---|
| `employment_status` | **Current** status (e.g. "Confirmed", "Trainee") | All 2,538 active rows |
| `previous_employment_status` | Status **immediately before** the current one | **0 of 2,538 rows** (100 % NULL) |
| `confirmation_date` | HR-entered date of confirmation | 3 rows populated |
| `confirmation_increment_granted` | Boolean — did HR already pay the confirmation increment? | 0 rows = true |
| `confirmation_increment_effective_date` | Effective date of that increment | 0 rows populated |

**There is no `employment_status_history` table.** The whole schema was searched — only `safety_incident_status_history` exists, which is unrelated.

So today the system stores **only the latest status and at most one prior label** — there is no audit trail of *when* the transition happened, *who* did it, or the *full sequence* of status changes.

### Rule store
`confirmation_increment_rules`:
- `applicable_transitions text[]` — set of canonical keys: `trainee_to_confirmed`, `probation_to_confirmed`, `contract_to_confirmed`, `apprenticeship_to_confirmed`.
- `treatment` enum: `ignore | adjust_covered_period | shift_next_cycle | carry_forward_uncovered`.
- Scope cascade: Level → Category → Company → Global.

### Pure adjuster (`src/lib/confirmationIncrementAdjuster.ts`)
This lib **does the gate correctly**:
1. Reads `rule.applicableTransitions`.
2. Maps `preConfirmationStatus` → canonical transition via `statusToTransition()`.
3. If the transition is not in the rule's whitelist → returns `treatmentApplied = 'ignore'` with reason `"Transition X not in rule applicability list"`.

So the contract is sound *in the library*.

### **BUG — the engine bypasses the gate**

`supabase/functions/compute-increment/index.ts`:

```ts
// line 114
function resolveConfirmationRule(rules, p): ConfirmationTreatment {
  // returns ONLY treatment string — drops applicable_transitions entirely
}

// line 672–685 — call site
const treatment = resolveConfirmationRule(confRules, p);   // ← just the enum
const adjustment = adjustConfirmationIncrement({
  confirmationGranted: !!p.confirmation_increment_granted,
  confirmationEffective: p.confirmation_increment_effective_date ?? null,
  cycleStart: cycleStartISO,
  cycleEnd: cycleEndISO,
  naiveEligibleMonths,
  previousCycleUncovered: previousUncovered,
  treatment,                       // ← rule.applicableTransitions LOST
                                   // ← preConfirmationStatus NOT PASSED
});
```

Combined with `applicableTransitions` being optional (legacy fallback = "all transitions allowed"), the gate **never fires in production**. The engine will happily apply Trainee→Confirmed treatment to any employee for whom `confirmation_increment_granted = true` — regardless of what their pre-confirmation status actually was.

Today this is masked only because `confirmation_increment_granted` is 0 % populated, so the `ignore` short-circuit on line 138 of the adjuster always wins. The moment HR starts marking confirmations, every employee will be treated as Trainee→Confirmed silently.

### Required-fields checklist

| Need | Present | Notes |
|---|---|---|
| employee_id | ✅ | `profiles.id` |
| previous employment status | ⚠️ Column exists, **never populated**, single-slot only | No history table |
| new employment status | ✅ | `employment_status` |
| effective date of status change | ❌ | No column |
| confirmation date | ✅ | `confirmation_date` |
| confirmation increment effective date | ✅ column / ❌ data | `confirmation_increment_effective_date` always NULL |
| salary revision on confirmation | ❌ | Not modelled |
| assessment-year mapping | ✅ | Derived in engine from fiscal cycle |
| changed_by / changed_at | ❌ | No status-change audit |

## 2. Risk & Impact

- **Data Impact**: Adding `employment_status_history` is **additive**, rollback-safe. Backfill is best-effort from `previous_employment_status` + `confirmation_date` where present (3 employees today).
- **Workflow Impact**: User Management Edit dialog must capture `previous_employment_status` (and, going forward, write a history row on every change). HR import paths must do the same.
- **UI/UX**: Run Details grid gains 3 columns: `Transition Type`, `Confirmation Effective`, `Adjustment Reason`. Calculation summary card shows count of "skipped — no transition history".
- **Regression Risk**: Medium. Touches the engine's adjuster call site. Fully covered by new unit tests + replay of the latest run.
- **Scalability**: History table is append-only, one row per status change per employee. With ~2,500 employees and ~1 change/yr the table grows ≤ 5 k rows/yr — trivial.
- **Mitigation**: Engine remains **fail-safe** — if no transition history exists for an employee, the rule is **skipped** (not applied) and a clear reason is recorded. No silent application of Trainee→Confirmed treatment without proof.

## 3. Plan

### Step A — Database (one migration)

1. New table `public.employment_status_history`:
   - `id`, `employee_id` (FK → profiles), `previous_status text NULL`, `new_status text NOT NULL`, `effective_date date NOT NULL`, `changed_by uuid NULL`, `changed_at timestamptz default now()`, `source text` (`'manual_edit' | 'bulk_import' | 'backfill'`), `notes text`.
   - Index `(employee_id, effective_date desc)`.
   - RLS: select for `admin`, `management`, `hr_pms`; insert/update for `admin` + `service_role`.
   - GRANT block per the public-schema-grants contract.
2. Trigger `trg_profiles_status_change` on `profiles` AFTER UPDATE OF `employment_status`:
   - If `OLD.employment_status IS DISTINCT FROM NEW.employment_status` → insert a history row with `previous_status = OLD`, `new_status = NEW`, `effective_date = COALESCE(NEW.confirmation_date, current_date)`, `changed_by = auth.uid()`, `source = 'manual_edit'`.
   - Also sets `NEW.previous_employment_status = OLD.employment_status` in a BEFORE trigger so the snapshot column stays in sync.
3. **Backfill** (best-effort, idempotent): for every active employee where `previous_employment_status IS NOT NULL` OR (`employment_status = 'Confirmed'` AND `confirmation_date IS NOT NULL`), insert one history row with `previous_status = previous_employment_status`, `new_status = employment_status`, `effective_date = confirmation_date`, `source = 'backfill'`. Wrap with `ON CONFLICT DO NOTHING` against a unique partial index `(employee_id, new_status, effective_date) WHERE source = 'backfill'`.

### Step B — Engine fix (`supabase/functions/compute-increment/index.ts`)

1. Rewrite `resolveConfirmationRule` to return the **entire rule row** (not just the treatment), preserving `applicable_transitions`.
2. Fetch the most recent history row per scoped employee (`employment_status_history` filtered to `new_status = 'Confirmed'` and `effective_date BETWEEN cycleStart-overlap AND cycleEnd`).
3. Pass to `adjustConfirmationIncrement`:
   - `rule: { treatment, applicableTransitions: rule.applicable_transitions }`
   - `preConfirmationStatus: historyRow?.previous_status ?? p.previous_employment_status ?? null`
4. **Missing-history guard**: if a rule with non-empty `applicableTransitions` matches the employee's scope, the employee is currently Confirmed, BUT no history row + `previous_employment_status` is NULL → record `adjustment_reason = 'Status history missing — adjustment skipped (data gap)'` and increment a new run-summary counter `confirmation_skipped_no_history`.
5. Persist on each `increment_run_items`: `transition_key` (canonical), `pre_confirmation_status` (raw), `confirmation_effective_date` already exists.

### Step C — User Management Edit dialog

1. Add a "Previous Employment Status" select (same options as Employment Status) **only visible when the admin changes Employment Status**. Default to the current value before the edit. Disabled otherwise to avoid accidental edits.
2. On save, the BEFORE trigger already syncs `previous_employment_status`; the AFTER trigger writes the history row. UI just submits the update.
3. Tooltip: "Used by Confirmation Increment Adjustment. Once set, every future status change is auto-tracked."

### Step D — UI traceability on Run Details

Add 3 read-only columns to the Increment Run Details grid (and Excel export):

| Confirmation Adjustment | Transition | Effective | Reason |
|---|---|---|---|
| Yes / No | "Trainee → Confirmation" / "—" | 2025-09-15 | "Subtracted 7 months already covered by confirmation increment" |

A new tile on the Run summary card: `n employees skipped — missing status history`.

### Step E — Tests

1. `confirmationIncrementAdjuster.test.ts` — already exists; extend with: rule has `applicableTransitions=['trainee_to_confirmed']`, employee `preConfirmationStatus='Probation'` → returns `treatmentApplied='ignore'` with the "not in applicability list" reason.
2. `compute-increment/transition_resolution_test.ts` (new):
   - Active rule with `applicable_transitions=['trainee_to_confirmed']`, employee w/ history row `prev=Trainee` → applies treatment.
   - Same rule, employee w/ history row `prev=Probation` → skipped.
   - Same rule, employee w/ NO history + NULL `previous_employment_status` → skipped, run summary `confirmation_skipped_no_history++`.
   - Currently-Confirmed employee but rule list is empty (legacy) → behaves as today (no change).
3. Trigger test (`pgTAP` or psql script): UPDATE profiles employment_status → inserts history row + syncs `previous_employment_status`.

### Step F — Docs & Memory

- `DOCUMENTATION.md` → new "Confirmation Increment Adjustment" section describing transition detection, history table, fail-safe behavior.
- `POLICY.md` → add clause: *"Confirmation Increment Adjustment is applied only when (a) a matching `employment_status_history` row exists with `new_status = Confirmed` and `previous_status` mapping to a configured transition; OR (b) `profiles.previous_employment_status` is populated AND maps to a configured transition. Current `employment_status` alone is never proof of a past transition."*
- Memory: `mem://features/incentive/confirmation-adjustment-transition-gate`.
- ADR-073 documenting the engine signature change.

## 4. Acceptance Criteria Mapping

| User AC | How met |
|---|---|
| System explains the source of Trainee→Confirmed detection | `employment_status_history.previous_status` + fallback to `profiles.previous_employment_status` |
| Adjustment applied only for configured transitions | Adjuster gate (already coded) + engine now passes the rule **and** the pre-status |
| Current status alone never used as proof | Engine never reads `profiles.employment_status` to imply history; missing history → skip with reason |
| Missing history reported clearly | New run-summary counter + per-row `adjustment_reason = 'Status history missing — adjustment skipped (data gap)'` |
| Output shows transition + adjustment traceability | New columns on Run Details + Excel export |

## 5. Out of Scope

- Salary-revision-on-confirmation modelling (separate ask).
- Editing historical status-history rows (append-only by policy).
- UI for bulk import of historical status changes (handled by the existing import engine adding a `status_change_history` sheet in a later phase).
- Notifications when adjustment is skipped due to missing history.
