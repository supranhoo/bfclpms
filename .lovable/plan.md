# Bi-monthly history rows, and a hard guarantee that history never moves an employee's score

Two things to settle before you load Jul-25 → Jun-26 into the data table.

## 1. What I checked (facts, not assumptions)

**Your KPI's rhythm actually changes inside the year.** For "Power gen … 45 MWh / AFBC" the stored months are:

```text
Sep-25  Bi-Monthly      Jan-26  Bi-Monthly      Apr-26  Bi-Monthly
Oct-25  Bi-Monthly      Feb-26  Bi-Monthly      May-26  Bi-Monthly
Nov-25  Bi-Monthly      Mar-26  Bi-Monthly      Jun-26  Monthly   <-- different
Dec-25  Bi-Monthly
(Jul-25 and Aug-25: no rows at all)
```

So a single "this KPI is bi-monthly" label is wrong for this year. The history grid currently receives one frequency from the console header and would mislabel Jun-26.

**Ledger data does not touch employee scores today.** I read the two write paths:

- `org_kpi_dataset_row_save` writes only to the data-table row and its change trail.
- `org_kpi_dataset_bulk_import` (what "Enter history" uses) just loops that same function.
- There are only two triggers on the row table: one updates a timestamp, one marks the period's validation stale. Neither reaches an employee.

Scores move only when someone explicitly presses a **release / propagate** action, which calls a separate function. That function protects rows already at manager check, audit, skip level, HR, management or approved — but only under its default policy, and one of the console dialogs lets an admin choose "Overwrite + step back", which deliberately bypasses that protection.

So today your requirement holds by accident of design, not by rule. This plan makes it a rule.

## 2. How bi-monthly will look in the history table

Replace the flat 12-row grid with a **rhythm-aware grid** driven by each month's *own* recorded frequency:

```text
Cycle                Month     Target   Achieved   Pro Ach %   Rating   Status
Jul–Aug 25           Aug-25    [    ]   [      ]        —        [  ]   New
Sep–Oct 25           Oct-25    14350    12508        87.2%       3      Unchanged
Nov–Dec 25           Dec-25    14177    14662       103.4%       5      Updated
Jan–Feb 26           Feb-26    ...
Mar–Apr 26           Apr-26    ...
May-26 (monthly)     May-26    ...
Jun-26 (monthly)     Jun-26    ...
```

Rules for the grid:

- One editable line per **review cycle**, not per calendar month. A bi-monthly cycle contributes one line, anchored on the cycle's closing month; a monthly stretch contributes one line per month.
- The left column names the months the cycle covers, so "Jul–Aug 25" reads as one figure covering two months — matching how your Excel sheet reports it.
- Where a month's frequency differs from its neighbours (Jun-26 here), the grid says so on that line instead of forcing it into a bi-monthly pair.
- A **"Show every month"** switch expands to all twelve calendar rows for anyone who wants the raw view; non-anchor months stay clearly marked and are not required.
- Months with no stored KPI row at all (Jul-25, Aug-25 here) still get a line so you can enter the legacy figure — they are labelled "no KPI record for this month" so it's obvious the number is reference history.
- Paste from Excel still works, and lands on the lines in the order shown.

## 3. The guarantee: history is reference data, it never re-scores anyone

New rule, enforced in three places rather than trusted:

1. **Entry can never score.** Writing or editing a data-table row (single, history grid, or CSV) will never call the propagation path. This is true today; it becomes a tested invariant so a future change can't quietly break it.
2. **A closed period cannot be released.** Release / propagate for a data table will refuse any period that belongs to a fiscal cycle that is already closed — the whole Jul-2025 → Jun-2026 year in your case — regardless of which overwrite policy is chosen, including "Overwrite + step back". The refusal is server-side, so it also holds for anything calling the function directly.
3. **The screen says so.** When the grid or the table is showing a closed cycle, a plain banner reads: *"Jul 2025 – Jun 2026 is closed. Figures entered here are recorded as history for reference and reporting. They will not change any employee's score."* The release button is hidden, not just disabled-on-click.

Reopening a closed year stays possible, but only as a deliberate admin action with a reason, and it is written to the audit trail.

## 4. Technical notes

- Per-month rhythm comes from the actual `kpis` rows for the KPI across both calendar years of the cycle, paired with `isFiscalTuple` (fiscal-window guard), then folded into cycle lines with `buildCycleScopeLabel`. The console header's frequency becomes a fallback only, used when a month has no KPI row.
- New helper in `src/lib/review/kpiLedgerModel.ts`: builds cycle lines from `(month, frequency)` pairs; `diffHistoryGrid` keys off the anchor `(period, year)` exactly as now, so the write payload is unchanged.
- `LedgerHistoryDialog` and `LedgerRowDialog` take a per-month frequency map instead of a single `frequency` string.
- Closed-cycle guard: a check inside `org_kpi_dataset_release_scoped` (and the shared release path) against the existing review-period governance settings, returning a clear refusal rather than raising. Requires one migration.
- Regression tests: cycle-line construction for a mixed bi-monthly/monthly year; a test asserting the ledger save path issues no propagation call; a test asserting release refuses a closed period under every overwrite policy.
- ADR-319 and POLICY §KPI-LEDGER-HISTORY-IS-NON-SCORING, plus an amendment to ADR-318.

## 5. What I need from you

The closed-year rule needs one decision — see the question below.
