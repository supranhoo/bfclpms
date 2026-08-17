# Fix: "Pending At Level" is one stage behind in the KPI Status Tracker

## What I verified against live data

Both employees in your sample really do report to Gaurav Budhia:

```text
100856 Abhas Luharuwalla -> manager 100001 Gaurav Budhia
101125 Jaspal            -> manager 100001 Gaurav Budhia
```

So **"Pending With (Name)" is correct**, and **"Days in Stage" is correct** too — e.g. row 13
(Budgetry Prepration) has exactly one stage-moving audit event, `SELF_REVIEW_SUBMITTED` on
2026-07-06, which matches the ~41 days shown.

The wrong column is **"Pending At Level"**. It reads `Employee (Self Review)` while the very
same row says the KPI is waiting on the reporting manager. Cause: the column is produced by a
hardcoded lookup that maps the KPI status straight to a label:

```text
self_review -> "Employee (Self Review)"
manager_check -> "Manager"
```

But by the project's canonical convention (POLICY: status = last COMPLETED stage), `self_review`
means self review is *finished* and the KPI is pending with the **Manager**. Every row in the
report is therefore labelled with the stage that is already done, one step behind reality — and
it contradicts the Pending With name sitting next to it.

Two further defects in the same lookup:
- It ignores the per-employee workflow chain, so it can never say `Functional Manager`, and it
  says `Skip-Level Manager` / `HR PMS` / `Audit` even for employees whose resolved chain skips
  those stages.
- The same hardcoded map is duplicated twice inside the report file (screen and export path),
  so the two can drift.

## The fix

1. **Derive Pending At Level from the same resolved workflow chain as Pending With.**
   New pure helper `src/lib/reports/pendingAtLevel.ts`:
   `resolvePendingAtLevel({ status, isOrgKpi, stageChain })` returns the label of the **next**
   stage in the employee's resolved chain (`get_bulk_employee_workflows`, POLICY §105) — never a
   hardcoded ladder.
   - `kra_set` + individual KPI -> `Employee (Self Review)`
   - `kra_set` + org KPI -> `Org KPI Data Owner`
   - `self_review` -> `Manager`
   - reviewer stages -> next stage in the chain (`Functional Manager`, `Skip-Level Manager`,
     `HR PMS`, `Audit`, `Management`)
   - `approved` / no next stage -> `—`
2. **Single source, both surfaces.** Delete both copies of the hardcoded map in
   `src/pages/reports/KpiStatusTracker.tsx` and call the helper once; screen and Excel read the
   same value. `pending_at_level` keeps its `field_key`, so Report Field Sequence overrides are
   untouched.
3. **Guaranteed consistency with Pending With.** The helper takes the same `stageChain` the
   Pending With resolver already uses, so level and name can no longer disagree.

## UI changes

Only the text inside the existing "Pending At Level" column changes (screen + Excel). No new
columns, no layout, filter, sort or responsiveness change. Your sample rows would read
`Manager` instead of `Employee (Self Review)`.

## Technical notes

- Pure helper, no I/O — the chain map is already fetched by `buildPendingWithContext`.
- Tests `src/test/pendingAtLevel.test.ts`: next-stage-from-chain, org-KPI vs individual at
  `kra_set`, chain without skip-level, functional-manager chain, approved -> `—`, and
  screen/export parity plus agreement with `resolvePendingWith`.
- Docs: ADR-293 + POLICY §RPT-PENDING-AT-LEVEL-CHAIN-SSOT, DOCUMENTATION.md version history.

## Risk

Presentation-only, one report. No schema, RPC or write changes. Labels shift forward one stage —
that is the correction. Rollback = restore the previous status->label map.
