# Exception KPIs — one entry per department, everyone in it is scored

## The problem in your words

For LTI/STI-type safety KPIs, nobody should key in a value per employee. A data
entry officer should see **every department in one table**, type a number only
where an incident happened, and leave the rest alone. Departments with an
incident pull their employees' score down; every other department's employees
get the clean (positive) score automatically.

Today the pieces exist but not the pattern: the data table (ledger) starts
empty and needs rows added one at a time, and the value that reaches employees
is a single organisation-wide number. So a department-by-department negative
KPI can only be done by hand — which is exactly the repetition you called out.

## What is already there (verified)

- The ledger can already carry a department on each row, page rows server-side,
  keep history for every change, dry-run imports and take an audit sign-off.
- Propagation to employees already supports a **departmental** scope: it can push
  one value to only the employees of one department, scoring each from their own
  bands, and it never touches a locked final score.
- Scoring already supports lower-is-better bands, so "0 incidents = full marks,
  1 incident = big drop" needs no new maths.

The gap is the operating model on top: seeding the whole department roster,
defaulting the clean value, entering only the exceptions, and fanning out per
department in one approved action.

## The proposed process (end to end)

```text
1  Declare the KPI as an EXCEPTION KPI
   scope = department · clean value = 0 · direction = lower is better

2  SEED the period            (one click, no typing)
   the table is filled with one row per department, value 0, status "clean"

3  ENTER only the exceptions  (data entry officer)
   type 1 (or 2, 3...) against the 2-3 departments that had an LTI/STI
   everything left untouched stays 0 — no cell-by-cell work

4  REVIEW the sheet           (Safety head / HR / Audit ladder)
   the approver sees: total departments, how many flagged, how many employees
   will be affected, and each flagged department by name

5  RELEASE                    (one approved action)
   flagged departments  -> their employees get the penalty score
   all other departments-> their employees get the clean score
   locked / already-final scores are skipped and listed, never overwritten

6  TRACE
   every seed, edit, approval and release is recorded with who and when
```

Result: a 40-department organisation is one seed click, three typed numbers,
one approval — not thousands of cells.

## What we build

**1. Exception-KPI mode on the data table**
A KPI's table can be marked as an exception table. It stores: the scope it is
kept by (department, business unit, or location), the clean value (usually 0),
and the direction (lower is better). Nothing is hardcoded — it is configuration,
so any future "any negative value hurts" KPI (near miss, audit failure,
non-conformance, absent-days breach, environmental exceedance) uses the same
mechanism without a code change.

**2. Seed the roster for a period**
A "Fill all departments" action creates one row per active department for the
selected period, pre-set to the clean value, skipping departments that already
have a row. Runs as a preview first (it will add N rows, N already exist), and
is repeatable safely — re-running never duplicates.

**3. Exception-only entry view**
The table gains a filter: All / Flagged only / Not entered. The officer works
the "Flagged" list. A summary line above the grid always states, in plain
language, how many departments are flagged, how many employees those cover, and
how many departments are still untouched.

**4. Impact preview before approval**
Before anyone approves, a preview lists each flagged department, the value, the
number of employees affected, and the score each of them would land on. The
approver approves the sheet, not a spreadsheet attachment.

**5. Scope-aware release**
Releasing the period walks the table and, per row, propagates that row's value
to only that row's department, using each employee's own bands. Departments with
no incident are released at the clean value in the same run, so nobody is left
blank. Employees whose score is already final are skipped and reported.

**6. Guardrails**
- Bounded work per run and a batch-by-batch commit — a release of thousands of
  employees never fires one request per person.
- A single-flight lock so two people cannot release the same period twice.
- Idempotent: re-running a release skips what is already done.
- Full audit trail and an undo path for the run.

## Technical notes

- Additive configuration on `org_kpi_dataset_defs`: `entry_mode`
  (`row_entry` | `exception`), `scope_dimension`, `clean_value`,
  `exception_direction`. KPIs without it behave exactly as today.
- New RPCs, all SECURITY DEFINER, dry-run first, `EXECUTE` revoked from
  `PUBLIC`/`anon`: `org_kpi_dataset_seed_scope_rows`,
  `org_kpi_dataset_exception_summary`, `org_kpi_dataset_release_preview`,
  `org_kpi_dataset_release_scoped`.
- Release reuses the existing scoped propagation path (`departmental` scope with
  a department id) per row, so POLICY §88 immutability, band-based per-employee
  scoring and skip reporting are inherited rather than re-implemented.
- Reads stay server-paged; the release loop is batched and resumable.
- Client SSOT extends `src/lib/review/kpiLedgerModel.ts` with exception
  classification, roster-coverage counting and impact projection, mirrored by
  unit tests; UI changes are confined to `KpiLedgerPanel`, a new seed dialog and
  a release preview dialog.
- POLICY gets §KPI-EXCEPTION-SCOPED-SCORING; DOCUMENTATION and a new ADR record
  the decision, rollback and verification.

## Risk and impact

- **Data:** additive columns and new rows only; no existing table or score is
  restructured. Rollback is dropping the new columns/RPCs — existing tables keep
  working.
- **Workflow:** the current approval ladder is unchanged; release becomes an
  explicit, previewed step rather than an implicit one.
- **Regression:** the risk is over-writing scores that should not move. Mitigated
  by reusing the existing skip rules for final/locked scores and by preview-first
  on every write.
- **Scale:** seeding is one row per department (tens), not per employee; the
  employee fan-out happens server-side in bounded batches.

## Sequence

1. Configuration + seeding (declare exception mode, fill the roster).
2. Entry view (flagged filter, coverage summary).
3. Impact preview.
4. Scope-aware release with batching, locking and audit.
5. Tests, POLICY/DOCUMENTATION/ADR.

## Confirm before build

- Clean value for LTI/STI: 0 incidents = full marks, correct?
- Should one incident zero the whole KPI for that department, or step down by
  the existing R5–R0 bands per incident count?
- Roster scope: seed all active departments organisation-wide, or only those
  mapped to the KPI?
