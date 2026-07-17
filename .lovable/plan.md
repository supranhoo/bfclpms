# Fix — BU Head reviews must not route to a Dept Head

## Problem (RCA)

A BU Head does not report to a Department Head, so their Annual Review must terminate at the BU Head stage (mirroring the Jaspal precedent). Today, when an employee is themselves the `business_units.head_user_id`, their own review instance still carries `dept_head` in `enabled_stages` with `dept_head_id` pointing to a **subordinate** dept head. After Self, the workflow incorrectly routes to `pending_dept` (a junior reviewer).

Live examples in the active cycle (sample):

| BU Head (employee) | BU headed | Wrongly routed dept_head | Status |
|---|---|---|---|
| Sajid Raza (100264) | 1050 TPD / 3X100 TPD / DRI | Jyoti Prakash Dwivedi | pending_self |
| Jitendra Kumar Dwivedi (101148) | 45 MW / 8 MW | Satyendra Kumar Singh | pending_self |
| Abhas Luharuwalla (100856) | Commercial-Plant | Atul Kumar Khaitan | **pending_dept** (already mis-routed) |
| Anil Kumar Pathak (200301) | BFCL-Infra / CLU | Umesh Kumar Mahato | pending_self |
| Parshu Ram Shukla (100894) | CCM | Dilip Kumar Ojha | pending_self |

The Jaspal case worked only accidentally, because he happens to also be the configured dept_head — the `duplicate_reviewer` rule in `effectiveChain` collapsed dept_head into bu_head. For BU Heads whose configured dept head is a different (junior) person, no dedup rule fires.

## Rule (new — POLICY §AR-BU-HEAD-TERMINAL)

> If an employee's `id` appears in `business_units.head_user_id` for any active BU, the `dept_head` stage MUST be removed from that employee's review chain. The chain terminates at `bu_head` (then `hr` if enabled). Rationale: a BU Head is organizationally senior to every Dept Head under their BU; routing their form to a Dept Head is a hierarchy inversion.

Interaction with existing policy §AR-HEAD-MASTER-AUTHORITATIVE: the master-data head remains authoritative for *other* employees. This rule only strips the stage for the BU-head-employee's own instance.

## Risk & Impact Report

- **Data**: Rewrites `enabled_stages` (drop `dept_head`) and sets `dept_head_id = NULL` on open instances of BU-head employees only. Full audit row per change into a new `annual_review_bu_head_terminal_audit_2026_07`. No completed instances touched.
- **Workflow**: Instances currently at `pending_dept` for BU-head employees jump forward to `pending_bu` (or `completed` if bu_head === self and hr disabled). Any dept_head submissions already recorded for these instances are preserved as historical rows in `annual_review_responses`; they simply become non-blocking.
- **UI**: Stepper for these employees will show `Self → BU → HR` (no Dept card). Team queues of the wrongly-mapped dept heads shrink correspondingly — desired.
- **Regression**: `effectiveChain` still handles the Jaspal duplicate-reviewer case; new rule is additive and evaluated *before* duplicate detection.
- **Rollback**: `annual_review_bu_head_terminal_audit_2026_07` stores prior `enabled_stages` + `dept_head_id`; a single UPDATE reverses the patch.

## Plan

### 1. Diagnostic (read-only)
Add RPC `annual_review_bu_head_terminal_diagnostic(cycle_id)` returning every instance where `employee_id` ∈ `business_units.head_user_id` AND `enabled_stages` contains `dept_head`. Columns: employee, BU(s) headed, current `overall_status`, current `dept_head_id`, projected new chain.

### 2. Systemic fix (SSOT — SQL + TS mirror)

**SQL** (`resolve_effective_chain` and seed functions):
- New helper `public.is_bu_head(user_id, cycle_id)` returning boolean.
- In `seed_annual_review_instances*`: if `is_bu_head(employee_id)`, exclude `dept_head` from `enabled_stages` and leave `dept_head_id` NULL.
- Cascade trigger on `business_units.head_user_id` (already exists from ADR-108) extended: when a new BU head is set, run the strip-dept_head repair on their open instances.

**TypeScript mirror** (`src/lib/annualReview/effectiveChain.ts`):
- Add new skip reason `bu_head_terminal` evaluated first.
- Extend `ResolveInput` with `employeeIsBuHead: boolean`.
- When true and stage === `dept_head`, mark skipped with reason `bu_head_terminal`.

### 3. One-shot data patch
`repair_bu_head_terminal_chains(cycle_id, dry_run)`:
- For each open instance where employee is a BU head and `dept_head` ∈ enabled_stages:
  - Snapshot to audit table.
  - Remove `dept_head` from `enabled_stages`, set `dept_head_id = NULL`.
  - If `overall_status = 'pending_dept'`, advance to `pending_bu` (or resolve via existing `next_status` helper).
- Dry-run mode returns projected changes without writing.

### 4. UI
`KpiJourneySection` / stepper already reads `enabled_stages` — no code change needed; the Dept card disappears automatically.

### 5. Governance & tests
- POLICY.md: add §AR-BU-HEAD-TERMINAL with the rule above.
- DOCUMENTATION.md: version history entry.
- ADR-109 documenting the decision.
- Vitest: extend `effectiveChain.test.ts` — BU-head-employee with a distinct dept_head configured must produce chain `[self, bu_head, hr]`.
- SQL test: `is_bu_head` + repair RPC round-trip on a seeded fixture.

## Expected outcome (all BU Heads, active cycle)

After patch, every row where `dept_is_self = false` in the diagnostic table becomes:

```text
Self → BU Head (self-approve or auto-skip via existing self_assignment rule) → HR (if enabled)
```

Rows where `dept_is_self = true` (e.g. Sindhu Raj Singh, Gaurav Budhia, Nitesh Kumar Baldwa) are unaffected — they already collapse via `duplicate_reviewer`.

## Out of scope
- Changing `business_units.head_user_id` master data.
- Retro-editing already `completed` instances.
- Applying the same terminal rule to Dept Heads (a Dept Head still reports up to a BU Head — no inversion).

## Files to change
- `supabase/migrations/<ts>_bu_head_terminal.sql` — helper, seed update, repair + diagnostic RPCs, audit table, cascade trigger extension.
- `src/lib/annualReview/effectiveChain.ts` + test.
- `POLICY.md`, `DOCUMENTATION.md`, `docs/adr/ADR-109.md`.
